import { SendMessageCommand } from '@aws-sdk/client-sqs';
import { EntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';

import { MetricsService } from '@/core/observability/services/metrics.service';
import { settings } from '@/core/settings';
import { SqsClientService } from '@/core/sqs/sqs-client.service';

import type { IOutboxRepository } from '../../domain/outbox.repository.interface';
import { OUTBOX_TOKENS } from '../../outbox.tokens';

@Injectable()
export class OutboxPublisherWorker implements OnApplicationBootstrap, OnApplicationShutdown {
	private readonly logger = new Logger(OutboxPublisherWorker.name);
	private timer?: NodeJS.Timeout;
	private isProcessing = false;
	private isRunning = false;

	constructor(
		@Inject(OUTBOX_TOKENS.REPOSITORY)
		private readonly outboxRepository: IOutboxRepository,
		private readonly sqsClientService: SqsClientService,
		private readonly entityManager: EntityManager,
		private readonly metricsService: MetricsService
	) {}

	onApplicationBootstrap(): void {
		if (settings.nodeEnv === 'test') return;

		this.start();
	}

	onApplicationShutdown(): void {
		this.stop();
	}

	start(intervalMs = 1000): void {
		if (this.isRunning) return;
		this.isRunning = true;

		this.timer = setInterval(() => {
			this.processPendingMessages().catch(err => {
				this.logger.error(
					`Unexpected error during outbox publishing cycle: ${(err as Error).message}`,
					(err as Error).stack
				);
			});
		}, intervalMs);
	}

	stop(): void {
		this.isRunning = false;

		if (this.timer) {
			clearInterval(this.timer);
			this.timer = undefined;
		}
	}

	async processPendingMessages(batchSize = 50): Promise<number> {
		if (this.isProcessing) return 0;
		this.isProcessing = true;

		try {
			const lag = await this.outboxRepository.countPending();
			this.metricsService.setOutboxLag(lag);

			if (lag === 0) return 0;

			return await this.entityManager.transactional(async () => {
				const pendingMessages = await this.outboxRepository.findPendingDue(batchSize);
				if (pendingMessages.length === 0) return 0;

				const targetQueueUrl = settings.sqs.queues.wagerEvents ?? settings.sqs.queues.wagerTransactions;
				let publishedCount = 0;

				const messagesByGroup = new Map<string, typeof pendingMessages>();
				for (const message of pendingMessages) {
					const payloadRecord = message.payload as Record<string, unknown> | null | undefined;
					const dataRecord = payloadRecord?.data as Record<string, unknown> | null | undefined;
					const groupId =
						(typeof dataRecord?.walletId === 'string' && dataRecord.walletId) ||
						(typeof payloadRecord?.walletId === 'string' && payloadRecord.walletId) ||
						message.aggregateId;

					const group = messagesByGroup.get(groupId);
					if (group) {
						group.push(message);
					} else {
						messagesByGroup.set(groupId, [message]);
					}
				}

				await Promise.all(
					Array.from(messagesByGroup.entries()).map(async ([groupId, groupMessages]) => {
						for (const message of groupMessages) {
							try {
								await this.sqsClientService.client.send(
									new SendMessageCommand({
										QueueUrl: targetQueueUrl,
										MessageBody: JSON.stringify({
											id: message.id,
											aggregateId: message.aggregateId,
											eventType: message.eventType,
											payload: message.payload,
											occurredAt: message.occurredAt.toISOString()
										}),
										MessageGroupId: groupId,
										MessageDeduplicationId: message.id
									})
								);

								message.markPublished();
								publishedCount++;
								this.logger.log(`Outbox message published`, {
									messageId: message.id,
									transactionId: message.aggregateId
								});
							} catch (error) {
								this.logger.error(
									`Failed to publish message ${message.id}: ${(error as Error).message}`,
									(error as Error).stack,
									{
										messageId: message.id,
										transactionId: message.aggregateId
									}
								);
								this.metricsService.recordRetry('outbox');
								message.scheduleRetry();
								if (message.hasExceededMaxAttempts()) {
									this.metricsService.recordDlq();
									this.logger.error(
										`Outbox message ${message.id} reached max retry attempts and will not be retried`
									);
								}
								break;
							}
						}
					})
				);

				await this.outboxRepository.updateMany(pendingMessages);

				return publishedCount;
			});
		} finally {
			this.isProcessing = false;
		}
	}
}
