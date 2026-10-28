import { AppModule } from '@/app.module';
import { DeleteMessageCommand, ReceiveMessageCommand } from '@aws-sdk/client-sqs';
import { EntityManager, RequestContext } from '@mikro-orm/postgresql';
import { type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { settings } from '@/core/settings';
import { SqsClientService } from '@/core/sqs/sqs-client.service';
import { OutboxPublisherWorker } from '@/modules/outbox/infrastructure/workers/outbox-publisher.worker';
import { ProcessWagerTransactionUseCase } from '@/modules/wagering/application/use-cases/process-wager-transaction.use-case';
import { WagerTransactionKind, WagerTransactionStatus } from '@/modules/wagering/domain/wager-transaction';
import { CreateWalletUseCase } from '@/modules/wallet/application/use-cases/create-wallet.use-case';

import {
	startLocalstackContainer,
	startPostgresContainer,
	type TestLocalstackContext,
	type TestPostgresContext
} from './support/test-containers';

describe('Outbox SQS Integration', () => {
	let postgresContext: TestPostgresContext;
	let localstackContext: TestLocalstackContext;
	let app: INestApplicationContext;

	let createWalletUseCase: CreateWalletUseCase;
	let processWagerUseCase: ProcessWagerTransactionUseCase;
	let outboxPublisherWorker: OutboxPublisherWorker;
	let sqsClientService: SqsClientService;
	let entityManager: EntityManager;

	beforeAll(async () => {
		postgresContext = await startPostgresContainer();
		localstackContext = await startLocalstackContainer();

		app = await NestFactory.createApplicationContext(AppModule, { logger: false });

		createWalletUseCase = app.get(CreateWalletUseCase);
		processWagerUseCase = app.get(ProcessWagerTransactionUseCase);
		outboxPublisherWorker = app.get(OutboxPublisherWorker);
		sqsClientService = app.get(SqsClientService);
		entityManager = app.get(EntityManager);
	}, 30000);

	afterAll(async () => {
		await app?.close();
		await localstackContext?.stop();
		await postgresContext?.stop();
	}, 30000);

	it('should publish pending outbox message to SQS queue', async () => {
		const playerId = crypto.randomUUID();
		const wallet = await RequestContext.create(entityManager, async () =>
			createWalletUseCase.execute({
				playerId,
				initialBalance: { amount: '100.00', currency: 'BRL' }
			})
		);

		const wagerResult = await RequestContext.create(entityManager, async () =>
			processWagerUseCase.execute({
				idempotencyKey: `${playerId}:outbox-test-1`,
				providerId: 'provider-test',
				externalTransactionId: `ext-${crypto.randomUUID()}`,
				playerId,
				walletId: wallet.id,
				roundId: 'round-outbox-1',
				gameId: 'game-outbox',
				kind: WagerTransactionKind.Bet,
				money: { amount: '35.00', currency: 'BRL' }
			})
		);

		expect(wagerResult.status).toBe(WagerTransactionStatus.Processed);

		const publishedCount = await RequestContext.create(entityManager, async () =>
			outboxPublisherWorker.processPendingMessages()
		);

		expect(publishedCount).toBeGreaterThanOrEqual(1);

		const sqsResponse = await sqsClientService.client.send(
			new ReceiveMessageCommand({
				QueueUrl: settings.sqs.queues.wagerTransactions,
				MaxNumberOfMessages: 10,
				WaitTimeSeconds: 5
			})
		);

		const messages = sqsResponse.Messages ?? [];
		expect(messages.length).toBeGreaterThan(0);

		const transactionProcessedMessage = messages.find(msg => {
			if (!msg.Body) return false;
			try {
				const body = JSON.parse(msg.Body);
				return body.eventType === 'WagerTransactionProcessed' && body.aggregateId === wagerResult.transactionId;
			} catch {
				return false;
			}
		});
		expect(transactionProcessedMessage).toBeDefined();

		const balanceChangedMessage = messages.find(msg => {
			if (!msg.Body) return false;
			try {
				const body = JSON.parse(msg.Body);
				return body.eventType === 'WalletBalanceChanged' && body.aggregateId === wallet.id;
			} catch {
				return false;
			}
		});
		expect(balanceChangedMessage).toBeDefined();

		for (const msg of messages) {
			if (msg.ReceiptHandle) {
				await sqsClientService.client.send(
					new DeleteMessageCommand({
						QueueUrl: settings.sqs.queues.wagerTransactions,
						ReceiptHandle: msg.ReceiptHandle
					})
				);
			}
		}
	});
});
