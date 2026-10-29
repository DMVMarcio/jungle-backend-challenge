import type { SQSClient } from '@aws-sdk/client-sqs';
import { EntityManager } from '@mikro-orm/postgresql';
import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';

import { MetricsService } from '@/core/observability/services/metrics.service';
import type { SqsClientService } from '@/core/sqs/sqs-client.service';

import { OutboxMessage } from '../../domain/outbox-message';
import { OutboxMemoryRepository } from '../database/outbox.memory.repository';
import { OutboxPublisherWorker } from './outbox-publisher.worker';

describe('Outbox Publisher Worker', () => {
	let sut: OutboxPublisherWorker;

	let outboxRepository: OutboxMemoryRepository;
	let metricsService: MetricsService;

	let mockSqsClient: { send: ReturnType<typeof mock> };
	let mockSqsClientService: SqsClientService;
	let entityManager: EntityManager;

	beforeEach(() => {
		outboxRepository = new OutboxMemoryRepository();
		metricsService = new MetricsService();

		mockSqsClient = { send: mock() };
		mockSqsClientService = {
			client: mockSqsClient as unknown as SQSClient,
			onModuleDestroy: () => {}
		};

		entityManager = {
			transactional: async <T>(cb: (em: EntityManager) => Promise<T>): Promise<T> => cb(entityManager)
		} as unknown as EntityManager;

		sut = new OutboxPublisherWorker(outboxRepository, mockSqsClientService, entityManager, metricsService);
	});

	it('should publish pending due messages and mark them published', async () => {
		const message = OutboxMessage.enqueue({
			id: 'msg-1',
			aggregateId: 'wallet-1',
			eventType: 'WagerTransactionProcessed',
			payload: { amount: '50.00' }
		});
		await outboxRepository.create(message);

		mockSqsClient.send.mockResolvedValue({});

		const publishedCount = await sut.processPendingMessages();

		expect(publishedCount).toBe(1);
		expect(mockSqsClient.send).toHaveBeenCalledTimes(1);

		const updatedMessage = outboxRepository.items[0];
		expect(updatedMessage.isPending()).toBe(false);
		expect(updatedMessage.publishedAt).toBeDefined();
	});

	it('should schedule retry when SQS client fails to send', async () => {
		const errorSpy = spyOn(Logger.prototype, 'error').mockImplementation(() => {});

		const message = OutboxMessage.enqueue({
			id: 'msg-2',
			aggregateId: 'wallet-1',
			eventType: 'WagerTransactionProcessed',
			payload: { amount: '100.00' }
		});
		await outboxRepository.create(message);

		mockSqsClient.send.mockRejectedValue(new Error('SQS connection error'));

		const publishedCount = await sut.processPendingMessages();

		expect(publishedCount).toBe(0);
		expect(errorSpy).toHaveBeenCalled();

		const updatedMessage = outboxRepository.items[0];
		expect(updatedMessage.isPending()).toBe(true);
		expect(updatedMessage.attempts).toBe(1);
		expect(updatedMessage.nextAttemptAt).toBeDefined();

		errorSpy.mockRestore();
	});

	it('should return 0 when there are no pending messages', async () => {
		const publishedCount = await sut.processPendingMessages();

		expect(publishedCount).toBe(0);
		expect(mockSqsClient.send).not.toHaveBeenCalled();
	});

	it('should process messages for same MessageGroupId sequentially and halt group on error', async () => {
		const errorSpy = spyOn(Logger.prototype, 'error').mockImplementation(() => {});

		const msg1 = OutboxMessage.enqueue({
			id: 'msg-group-1',
			aggregateId: 'tx-1',
			eventType: 'WagerTransactionProcessed',
			payload: { walletId: 'wallet-seq' },
			occurredAt: new Date('2026-10-28T12:00:00Z')
		});
		const msg2 = OutboxMessage.enqueue({
			id: 'msg-group-2',
			aggregateId: 'wallet-seq',
			eventType: 'WalletBalanceChanged',
			payload: { walletId: 'wallet-seq' },
			occurredAt: new Date('2026-10-28T12:00:01Z')
		});

		await outboxRepository.create(msg1);
		await outboxRepository.create(msg2);

		mockSqsClient.send.mockRejectedValueOnce(new Error('SQS failure on first message'));

		const publishedCount = await sut.processPendingMessages();

		expect(publishedCount).toBe(0);
		expect(mockSqsClient.send).toHaveBeenCalledTimes(1);

		expect(outboxRepository.items[0].attempts).toBe(1);
		expect(outboxRepository.items[1].attempts).toBe(0);

		errorSpy.mockRestore();
	});

	it('should halt retries and record dlq metric when message reaches MAX_ATTEMPTS', async () => {
		const errorSpy = spyOn(Logger.prototype, 'error').mockImplementation(() => {});

		const message = OutboxMessage.rehydrate({
			id: 'msg-poison-pill',
			aggregateId: 'wallet-1',
			eventType: 'WagerTransactionProcessed',
			payload: { amount: '10.00' },
			occurredAt: new Date('2026-10-28T12:00:00Z'),
			attempts: OutboxMessage.MAX_ATTEMPTS - 1
		});
		await outboxRepository.create(message);

		mockSqsClient.send.mockRejectedValue(new Error('Persistent SQS poison error'));

		await sut.processPendingMessages();

		const updatedMessage = outboxRepository.items[0];
		expect(updatedMessage.attempts).toBe(OutboxMessage.MAX_ATTEMPTS);
		expect(updatedMessage.hasExceededMaxAttempts()).toBe(true);
		expect(updatedMessage.isDue()).toBe(false);

		const nextPending = await outboxRepository.findPendingDue();
		expect(nextPending).toHaveLength(0);

		errorSpy.mockRestore();
	});
});
