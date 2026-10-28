import { DeleteMessageCommand, type Message, ReceiveMessageCommand, SendMessageCommand } from '@aws-sdk/client-sqs';
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';

import { settings } from '@/core/settings';
import { SqsClientService } from '@/core/sqs/sqs-client.service';

import type { IInboxRepository } from '@/modules/inbox/domain/inbox.repository.interface';
import { INBOX_TOKENS } from '@/modules/inbox/inbox.tokens';

import { ProcessWagerTransactionUseCase } from '../../application/use-cases/process-wager-transaction.use-case';
import { createWagerTransactionSchema } from '../../presentation/http/dto/create-wager-transaction.dto';

@Injectable()
export class SqsConsumerWorker implements OnApplicationBootstrap, OnApplicationShutdown {
	private readonly logger = new Logger(SqsConsumerWorker.name);
	private readonly consumerName = 'WagerTransactionConsumer';

	private isRunning = false;
	private isProcessing = false;

	constructor(
		@Inject(INBOX_TOKENS.REPOSITORY)
		private readonly inboxRepository: IInboxRepository,
		private readonly sqsClientService: SqsClientService,
		private readonly processWagerTransactionUseCase: ProcessWagerTransactionUseCase
	) {}

	onApplicationBootstrap(): void {
		if (settings.nodeEnv === 'test') return;

		this.start();
	}

	onApplicationShutdown(): void {
		this.stop();
	}

	start(): void {
		if (this.isRunning) return;
		this.isRunning = true;
		void this.runLoop();
	}

	stop(): void {
		this.isRunning = false;
	}

	async pollMessagesOnce(): Promise<number> {
		if (this.isProcessing) return 0;
		this.isProcessing = true;

		try {
			const response = await this.sqsClientService.client.send(
				new ReceiveMessageCommand({
					QueueUrl: settings.sqs.queues.wagerTransactions,
					MaxNumberOfMessages: 10,
					WaitTimeSeconds: 5,
					MessageSystemAttributeNames: ['ApproximateReceiveCount', 'MessageGroupId']
				})
			);

			const messages = response.Messages ?? [];
			if (messages.length === 0) return 0;

			let processedCount = 0;
			for (const message of messages) {
				if (!this.isRunning && settings.nodeEnv !== 'test') break;

				try {
					const processed = await this.processMessage(message);
					if (processed) processedCount++;
				} catch (error) {
					this.logger.warn(`Transient error on message ${message.MessageId}: ${(error as Error).message}`);
				}
			}

			return processedCount;
		} catch (error) {
			this.logger.error(`Error polling SQS: ${(error as Error).message}`);
			await new Promise(resolve => setTimeout(resolve, 1000));
			return 0;
		} finally {
			this.isProcessing = false;
		}
	}

	async processMessage(message: Message): Promise<boolean> {
		if (!message.Body || !message.ReceiptHandle) return false;

		const receiveCount = Number(message.Attributes?.ApproximateReceiveCount ?? '1');
		if (receiveCount >= 5) {
			await this.sendToDlq(message);
			return false;
		}

		let parsed: any;
		try {
			parsed = JSON.parse(message.Body);
		} catch {
			this.logger.error(`Malformed JSON in message ${message.MessageId}`);
			await this.sendToDlq(message);
			return false;
		}

		if (parsed?.type !== 'WagerTransactionRequested' || !parsed?.data) {
			this.logger.error(`Invalid message type or missing data in ${message.MessageId}`);
			await this.sendToDlq(message);
			return false;
		}

		const validation = createWagerTransactionSchema.safeParse(parsed.data);
		if (!validation.success) {
			this.logger.error(`Validation failed for message ${message.MessageId}: ${validation.error.message}`);
			await this.sendToDlq(message);
			return false;
		}

		const messageId = String(parsed.messageId ?? message.MessageId);
		const existingInbox = await this.inboxRepository.findByMessageIdAndConsumer(messageId, this.consumerName);

		if (existingInbox?.isProcessed()) {
			await this.deleteFromQueue(message.ReceiptHandle);
			return true;
		}

		const idempotencyKey =
			typeof parsed.data.idempotencyKey === 'string' && parsed.data.idempotencyKey.trim().length > 0
				? parsed.data.idempotencyKey
				: `${validation.data.providerId}:${validation.data.externalTransactionId}`;

		try {
			await this.processWagerTransactionUseCase.execute({
				...validation.data,
				idempotencyKey,
				inboxMessage: {
					messageId,
					consumerName: this.consumerName
				}
			});

			await this.deleteFromQueue(message.ReceiptHandle);
			return true;
		} catch (error) {
			this.logger.error(`Error processing message ${messageId}: ${(error as Error).message}`);
			throw error;
		}
	}

	private async runLoop(): Promise<void> {
		while (this.isRunning) {
			try {
				await this.pollMessagesOnce();
			} catch (error) {
				this.logger.error(`Error in consumer loop: ${(error as Error).message}`);
				await new Promise(resolve => setTimeout(resolve, 1000));
			}
		}
	}

	private async sendToDlq(message: Message): Promise<void> {
		if (!message.ReceiptHandle) return;

		await this.sqsClientService.client.send(
			new SendMessageCommand({
				QueueUrl: settings.sqs.queues.wagerTransactionsDlq,
				MessageBody: message.Body ?? '',
				MessageGroupId: message.Attributes?.MessageGroupId ?? 'dlq-group',
				MessageDeduplicationId: `${message.MessageId ?? 'unknown'}-${Date.now()}`
			})
		);

		await this.deleteFromQueue(message.ReceiptHandle);
	}

	private async deleteFromQueue(receiptHandle: string): Promise<void> {
		await this.sqsClientService.client.send(
			new DeleteMessageCommand({
				QueueUrl: settings.sqs.queues.wagerTransactions,
				ReceiptHandle: receiptHandle
			})
		);
	}
}
