import {
	ChangeMessageVisibilityCommand,
	DeleteMessageCommand,
	type Message,
	ReceiveMessageCommand,
	SendMessageCommand,
	type SQSClient
} from '@aws-sdk/client-sqs';
import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';

import { MetricsService } from '@/core/observability/services/metrics.service';
import { RequestContextService } from '@/core/observability/services/request-context.service';
import type { SqsClientService } from '@/core/sqs/sqs-client.service';
import { InboxMessage } from '@/modules/inbox/domain/inbox-message';
import { InboxMemoryRepository } from '@/modules/inbox/infrastructure/database/inbox.memory.repository';
import { WalletNotFoundError } from '@/modules/wallet/domain/wallet.errors';

import type { ProcessWagerTransactionUseCase } from '../../application/use-cases/process-wager-transaction.use-case';
import { SqsConsumerWorker } from './sqs-consumer.worker';

describe('SqsConsumerWorker', () => {
	let sut: SqsConsumerWorker;

	let inboxRepository: InboxMemoryRepository;
	let metricsService: MetricsService;
	let mockSqsClient: { send: ReturnType<typeof mock> };
	let mockSqsClientService: SqsClientService;
	let mockUseCase: { execute: ReturnType<typeof mock> };

	const validPayload = {
		messageId: 'msg-123',
		type: 'WagerTransactionRequested',
		occurredAt: '2026-07-29T15:00:00.000Z',
		data: {
			providerId: 'provider-a',
			externalTransactionId: 'transaction-123',
			idempotencyKey: 'provider-a:transaction-123',
			playerId: '0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1',
			walletId: '0192f291-27dd-7d3f-8071-5f8685deef37',
			roundId: 'round-987',
			gameId: 'fortune-chimp',
			kind: 'BET',
			money: { amount: '25.00', currency: 'BRL' }
		}
	};

	beforeEach(() => {
		inboxRepository = new InboxMemoryRepository();
		metricsService = new MetricsService();
		const requestContextService = new RequestContextService();

		mockSqsClient = { send: mock() };
		mockSqsClientService = {
			client: mockSqsClient as unknown as SQSClient,
			onModuleDestroy: () => {}
		};
		mockUseCase = { execute: mock() };

		sut = new SqsConsumerWorker(
			inboxRepository,
			mockSqsClientService,
			mockUseCase as unknown as ProcessWagerTransactionUseCase,
			metricsService,
			requestContextService
		);
	});

	it('should process a valid message, invoke use case, and delete from main queue', async () => {
		mockUseCase.execute.mockResolvedValue({
			transactionId: 'transaction-1',
			status: 'PROCESSED',
			balance: { amount: '75.00', currency: 'BRL' },
			idempotentReplay: false
		});
		mockSqsClient.send.mockResolvedValue({});

		const sqsMessage: Message = {
			MessageId: 'sqs-msg-1',
			ReceiptHandle: 'receipt-1',
			Body: JSON.stringify(validPayload),
			Attributes: {
				ApproximateReceiveCount: '1'
			}
		};

		const result = await sut.processMessage(sqsMessage);

		expect(result).toBe(true);
		expect(mockUseCase.execute).toHaveBeenCalledTimes(1);
		expect(mockUseCase.execute).toHaveBeenCalledWith({
			...validPayload.data,
			inboxMessage: {
				messageId: 'msg-123',
				consumerName: 'WagerTransactionConsumer'
			}
		});

		expect(mockSqsClient.send).toHaveBeenCalledTimes(1);
		const command = mockSqsClient.send.mock.calls[0][0];
		expect(command).toBeInstanceOf(DeleteMessageCommand);
	});

	it('should route unexpected integration event on command queue directly to DLQ', async () => {
		mockSqsClient.send.mockResolvedValue({});

		const sqsMessage: Message = {
			MessageId: 'sqs-event-msg-1',
			ReceiptHandle: 'receipt-event-1',
			Body: JSON.stringify({
				eventId: 'evt-1',
				eventType: 'WagerTransactionProcessed',
				aggregateId: 'tx-1',
				occurredAt: '2026-10-28T12:00:00.000Z',
				data: {}
			}),
			Attributes: {
				ApproximateReceiveCount: '1'
			}
		};

		const result = await sut.processMessage(sqsMessage);

		expect(result).toBe(false);
		expect(mockUseCase.execute).not.toHaveBeenCalled();
		expect(mockSqsClient.send).toHaveBeenCalledTimes(2);
		expect(mockSqsClient.send.mock.calls[0][0]).toBeInstanceOf(SendMessageCommand);
		expect(mockSqsClient.send.mock.calls[1][0]).toBeInstanceOf(DeleteMessageCommand);
	});

	it('should route directly to DLQ without retrying when use case throws deterministic domain error', async () => {
		spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
		mockUseCase.execute.mockRejectedValue(new WalletNotFoundError('0192f291-27dd-7d3f-8071-5f8685deef37'));
		mockSqsClient.send.mockResolvedValue({});

		const sqsMessage: Message = {
			MessageId: 'sqs-msg-wallet-not-found',
			ReceiptHandle: 'receipt-wallet-not-found',
			Body: JSON.stringify(validPayload),
			Attributes: {
				ApproximateReceiveCount: '1'
			}
		};

		const result = await sut.processMessage(sqsMessage);

		expect(result).toBe(false);
		expect(mockSqsClient.send).toHaveBeenCalledTimes(2);
		expect(mockSqsClient.send.mock.calls[0][0]).toBeInstanceOf(SendMessageCommand);
		expect(mockSqsClient.send.mock.calls[1][0]).toBeInstanceOf(DeleteMessageCommand);
	});

	it('should acknowledge and delete from queue without re-executing if message already processed in inbox', async () => {
		const existingInbox = InboxMessage.receive({
			messageId: 'msg-123',
			consumerName: 'WagerTransactionConsumer',
			payloadHash: 'hash-abc'
		});
		existingInbox.markProcessed();
		await inboxRepository.create(existingInbox);

		mockSqsClient.send.mockResolvedValue({});

		const sqsMessage: Message = {
			MessageId: 'sqs-msg-1',
			ReceiptHandle: 'receipt-dup',
			Body: JSON.stringify(validPayload),
			Attributes: {
				ApproximateReceiveCount: '1'
			}
		};

		const result = await sut.processMessage(sqsMessage);

		expect(result).toBe(true);
		expect(mockUseCase.execute).not.toHaveBeenCalled();
		expect(mockSqsClient.send).toHaveBeenCalledTimes(1);
		const command = mockSqsClient.send.mock.calls[0][0];
		expect(command).toBeInstanceOf(DeleteMessageCommand);
	});

	it('should send to DLQ and delete from main queue when receive count is 5 or more', async () => {
		mockSqsClient.send.mockResolvedValue({});

		const sqsMessage: Message = {
			MessageId: 'sqs-msg-max',
			ReceiptHandle: 'receipt-max',
			Body: JSON.stringify(validPayload),
			Attributes: {
				ApproximateReceiveCount: '5'
			}
		};

		const result = await sut.processMessage(sqsMessage);

		expect(result).toBe(false);
		expect(mockUseCase.execute).not.toHaveBeenCalled();
		expect(mockSqsClient.send).toHaveBeenCalledTimes(2);

		const sendCommand = mockSqsClient.send.mock.calls[0][0];
		expect(sendCommand).toBeInstanceOf(SendMessageCommand);

		const deleteCommand = mockSqsClient.send.mock.calls[1][0];
		expect(deleteCommand).toBeInstanceOf(DeleteMessageCommand);
	});

	it('should send to DLQ when JSON is malformed', async () => {
		spyOn(Logger.prototype, 'error').mockImplementation(() => {});
		mockSqsClient.send.mockResolvedValue({});

		const sqsMessage: Message = {
			MessageId: 'sqs-bad-json',
			ReceiptHandle: 'receipt-bad-json',
			Body: '{ invalid json',
			Attributes: {
				ApproximateReceiveCount: '1'
			}
		};

		const result = await sut.processMessage(sqsMessage);

		expect(result).toBe(false);
		expect(mockUseCase.execute).not.toHaveBeenCalled();
		expect(mockSqsClient.send).toHaveBeenCalledTimes(2);

		const sendCommand = mockSqsClient.send.mock.calls[0][0];
		expect(sendCommand).toBeInstanceOf(SendMessageCommand);
	});

	it('should send to DLQ when message type is not WagerTransactionRequested', async () => {
		spyOn(Logger.prototype, 'error').mockImplementation(() => {});
		mockSqsClient.send.mockResolvedValue({});

		const sqsMessage: Message = {
			MessageId: 'sqs-wrong-type',
			ReceiptHandle: 'receipt-wrong-type',
			Body: JSON.stringify({
				type: 'UnknownEvent',
				data: {}
			}),
			Attributes: {
				ApproximateReceiveCount: '1'
			}
		};

		const result = await sut.processMessage(sqsMessage);

		expect(result).toBe(false);
		expect(mockUseCase.execute).not.toHaveBeenCalled();
		expect(mockSqsClient.send).toHaveBeenCalledTimes(2);
		expect(mockSqsClient.send.mock.calls[0][0]).toBeInstanceOf(SendMessageCommand);
	});

	it('should send to DLQ when schema validation fails', async () => {
		spyOn(Logger.prototype, 'error').mockImplementation(() => {});
		mockSqsClient.send.mockResolvedValue({});

		const sqsMessage: Message = {
			MessageId: 'sqs-bad-schema',
			ReceiptHandle: 'receipt-bad-schema',
			Body: JSON.stringify({
				type: 'WagerTransactionRequested',
				data: {
					providerId: 'provider-a',
					externalTransactionId: 'transaction-1',
					playerId: 'not-a-uuid',
					walletId: 'not-a-uuid'
				}
			}),
			Attributes: {
				ApproximateReceiveCount: '1'
			}
		};

		const result = await sut.processMessage(sqsMessage);

		expect(result).toBe(false);
		expect(mockUseCase.execute).not.toHaveBeenCalled();
		expect(mockSqsClient.send).toHaveBeenCalledTimes(2);
		expect(mockSqsClient.send.mock.calls[0][0]).toBeInstanceOf(SendMessageCommand);
	});

	it('should throw and leave message in queue when use case throws unexpected error', async () => {
		spyOn(Logger.prototype, 'error').mockImplementation(() => {});
		mockUseCase.execute.mockRejectedValue(new Error('Database connection failed'));

		const sqsMessage: Message = {
			MessageId: 'sqs-transient-error',
			ReceiptHandle: 'receipt-transient-error',
			Body: JSON.stringify(validPayload),
			Attributes: {
				ApproximateReceiveCount: '1'
			}
		};

		await expect(sut.processMessage(sqsMessage)).rejects.toThrow('Database connection failed');
		expect(mockSqsClient.send).not.toHaveBeenCalled();
	});

	it('should poll SQS and process received messages', async () => {
		mockSqsClient.send
			.mockResolvedValueOnce({
				Messages: [
					{
						MessageId: 'msg-poll-1',
						ReceiptHandle: 'receipt-poll-1',
						Body: JSON.stringify(validPayload),
						Attributes: { ApproximateReceiveCount: '1' }
					}
				]
			})
			.mockResolvedValueOnce({});

		mockUseCase.execute.mockResolvedValue({
			transactionId: 'transaction-poll-1',
			status: 'PROCESSED',
			balance: { amount: '75.00', currency: 'BRL' },
			idempotentReplay: false
		});

		const count = await sut.pollMessagesOnce();

		expect(count).toBe(1);
		expect(mockUseCase.execute).toHaveBeenCalledTimes(1);
	});

	it('should return 0 when no messages returned from SQS', async () => {
		mockSqsClient.send.mockResolvedValueOnce({ Messages: [] });

		const count = await sut.pollMessagesOnce();

		expect(count).toBe(0);
		expect(mockUseCase.execute).not.toHaveBeenCalled();
	});
});
