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

			return await this.entityManager.transactional(async () => {
				const pendingMessages = await this.outboxRepository.findPendingDue(batchSize);
				if (pendingMessages.length === 0) return 0;

				await Promise.all(
					pendingMessages.map(async message => {
						try {
							await this.sqsClientService.client.send(
								new SendMessageCommand({
									QueueUrl: settings.sqs.queues.wagerTransactions,
									MessageBody: JSON.stringify({
										id: message.id,
										aggregateId: message.aggregateId,
										eventType: message.eventType,
										payload: message.payload,
										occurredAt: message.occurredAt.toISOString()
									}),
									MessageGroupId: message.aggregateId,
									MessageDeduplicationId: message.id
								})
							);

							message.markPublished();
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
						}

						await this.outboxRepository.update(message);
					})
				);

				return pendingMessages.filter(message => !message.isPending()).length;
			});
		} finally {
			this.isProcessing = false;
		}
	}
}
