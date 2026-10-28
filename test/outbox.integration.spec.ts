import { AppModule } from '@/app.module';
import { DeleteMessageCommand, ReceiveMessageCommand, SendMessageCommand } from '@aws-sdk/client-sqs';
import { EntityManager, RequestContext } from '@mikro-orm/postgresql';
import { type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { settings } from '@/core/settings';
import { SqsClientService } from '@/core/sqs/sqs-client.service';
import { OutboxPublisherWorker } from '@/modules/outbox/infrastructure/workers/outbox-publisher.worker';
import { ProcessWagerTransactionUseCase } from '@/modules/wagering/application/use-cases/process-wager-transaction.use-case';
import { WagerTransactionKind, WagerTransactionStatus } from '@/modules/wagering/domain/wager-transaction';
import type { IWagerTransactionRepository } from '@/modules/wagering/domain/wager-transaction.repository.interface';
import { PendingReferenceWorker } from '@/modules/wagering/infrastructure/workers/pending-reference.worker';
import { SqsConsumerWorker } from '@/modules/wagering/infrastructure/workers/sqs-consumer.worker';
import { WAGERING_TOKENS } from '@/modules/wagering/wagering.tokens';
import { CreateWalletUseCase } from '@/modules/wallet/application/use-cases/create-wallet.use-case';
import { GetWalletLedgerUseCase } from '@/modules/wallet/application/use-cases/get-wallet-ledger.use-case';
import { ReconcileWalletUseCase } from '@/modules/wallet/application/use-cases/reconcile-wallet.use-case';

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
	let sqsConsumerWorker: SqsConsumerWorker;
	let pendingReferenceWorker: PendingReferenceWorker;
	let reconcileUseCase: ReconcileWalletUseCase;
	let getLedgerUseCase: GetWalletLedgerUseCase;
	let wageringRepository: IWagerTransactionRepository;
	let sqsClientService: SqsClientService;
	let entityManager: EntityManager;

	beforeAll(async () => {
		postgresContext = await startPostgresContainer();
		localstackContext = await startLocalstackContainer();

		app = await NestFactory.createApplicationContext(AppModule, { logger: false });

		createWalletUseCase = app.get(CreateWalletUseCase);
		processWagerUseCase = app.get(ProcessWagerTransactionUseCase);
		outboxPublisherWorker = app.get(OutboxPublisherWorker);
		sqsConsumerWorker = app.get(SqsConsumerWorker);
		pendingReferenceWorker = app.get(PendingReferenceWorker);
		reconcileUseCase = app.get(ReconcileWalletUseCase);
		getLedgerUseCase = app.get(GetWalletLedgerUseCase);
		wageringRepository = app.get<IWagerTransactionRepository>(WAGERING_TOKENS.REPOSITORY);
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

		const targetQueueUrl = settings.sqs.queues.wagerEvents ?? settings.sqs.queues.wagerTransactions;
		const sqsResponse = await sqsClientService.client.send(
			new ReceiveMessageCommand({
				QueueUrl: targetQueueUrl,
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
						QueueUrl: targetQueueUrl,
						ReceiptHandle: msg.ReceiptHandle
					})
				);
			}
		}
	});

	it('should handle crash post-commit and pre-ack by acknowledging redelivered message idempotently via inbox', async () => {
		const playerId = crypto.randomUUID();
		const wallet = await RequestContext.create(entityManager, async () =>
			createWalletUseCase.execute({
				playerId,
				initialBalance: { amount: '100.00', currency: 'BRL' }
			})
		);

		const messageId = `msg-crash-${crypto.randomUUID()}`;
		const externalTransactionId = `ext-${crypto.randomUUID()}`;
		const idempotencyKey = `${playerId}:crash-test`;

		await sqsClientService.client.send(
			new SendMessageCommand({
				QueueUrl: settings.sqs.queues.wagerTransactions,
				MessageBody: JSON.stringify({
					type: 'WagerTransactionRequested',
					messageId,
					data: {
						idempotencyKey,
						providerId: 'provider-test',
						externalTransactionId,
						playerId,
						walletId: wallet.id,
						roundId: 'round-crash-1',
						gameId: 'game-crash',
						kind: WagerTransactionKind.Bet,
						money: { amount: '40.00', currency: 'BRL' }
					}
				}),
				MessageGroupId: wallet.id,
				MessageDeduplicationId: messageId
			})
		);

		await RequestContext.create(entityManager, async () =>
			processWagerUseCase.execute({
				idempotencyKey,
				providerId: 'provider-test',
				externalTransactionId,
				playerId,
				walletId: wallet.id,
				roundId: 'round-crash-1',
				gameId: 'game-crash',
				kind: WagerTransactionKind.Bet,
				money: { amount: '40.00', currency: 'BRL' },
				inboxMessage: {
					messageId,
					consumerName: 'WagerTransactionConsumer'
				}
			})
		);

		const receiveResponse = await sqsClientService.client.send(
			new ReceiveMessageCommand({
				QueueUrl: settings.sqs.queues.wagerTransactions,
				MaxNumberOfMessages: 1,
				WaitTimeSeconds: 5
			})
		);

		const receivedMessage = receiveResponse.Messages?.[0];
		expect(receivedMessage).toBeDefined();

		const processed = await RequestContext.create(entityManager, async () =>
			sqsConsumerWorker.processMessage(receivedMessage!)
		);
		expect(processed).toBe(true);

		const reconciliation = await RequestContext.create(entityManager, async () =>
			reconcileUseCase.execute({ walletId: wallet.id })
		);
		expect(reconciliation.consistent).toBe(true);
		expect(reconciliation.storedBalance.amount).toBe('60.00');
		expect(reconciliation.calculatedBalance.amount).toBe('60.00');
		expect(reconciliation.checkedEntries).toBe(2);

		const afterAckResponse = await sqsClientService.client.send(
			new ReceiveMessageCommand({
				QueueUrl: settings.sqs.queues.wagerTransactions,
				MaxNumberOfMessages: 1,
				WaitTimeSeconds: 1
			})
		);
		expect(afterAckResponse.Messages ?? []).toHaveLength(0);
	});

	it('should allow two concurrent publishers to process distinct outbox messages without duplication', async () => {
		const targetQueueUrl = settings.sqs.queues.wagerEvents ?? settings.sqs.queues.wagerTransactions;

		const purgeSqs = async () => {
			let msgs;
			do {
				const res = await sqsClientService.client.send(
					new ReceiveMessageCommand({
						QueueUrl: targetQueueUrl,
						MaxNumberOfMessages: 10,
						WaitTimeSeconds: 1
					})
				);
				msgs = res.Messages ?? [];
				for (const m of msgs) {
					if (m.ReceiptHandle) {
						await sqsClientService.client.send(
							new DeleteMessageCommand({
								QueueUrl: targetQueueUrl,
								ReceiptHandle: m.ReceiptHandle
							})
						);
					}
				}
			} while (msgs.length > 0);
		};
		await purgeSqs();

		const playerId = crypto.randomUUID();
		const wallet = await RequestContext.create(entityManager, async () =>
			createWalletUseCase.execute({
				playerId,
				initialBalance: { amount: '200.00', currency: 'BRL' }
			})
		);

		for (let i = 0; i < 4; i++) {
			await RequestContext.create(entityManager, async () =>
				processWagerUseCase.execute({
					idempotencyKey: `${playerId}:outbox-pub-${i}`,
					providerId: 'provider-test',
					externalTransactionId: `ext-${crypto.randomUUID()}`,
					playerId,
					walletId: wallet.id,
					roundId: `round-${i}`,
					gameId: 'game-pub',
					kind: WagerTransactionKind.Bet,
					money: { amount: '10.00', currency: 'BRL' }
				})
			);
		}

		const app2 = await NestFactory.createApplicationContext(AppModule, { logger: false });
		try {
			const publisher2 = app2.get(OutboxPublisherWorker);
			const em2 = app2.get(EntityManager);

			const [publishedCount1, publishedCount2] = await Promise.all([
				RequestContext.create(entityManager, async () => outboxPublisherWorker.processPendingMessages()),
				RequestContext.create(em2, async () => publisher2.processPendingMessages())
			]);

			expect(publishedCount1 + publishedCount2).toBeGreaterThanOrEqual(4);

			const receivedEvents: string[] = [];
			let msgs;
			do {
				const res = await sqsClientService.client.send(
					new ReceiveMessageCommand({
						QueueUrl: targetQueueUrl,
						MaxNumberOfMessages: 10,
						WaitTimeSeconds: 2
					})
				);
				msgs = res.Messages ?? [];
				for (const m of msgs) {
					if (m.Body) {
						const body = JSON.parse(m.Body);
						receivedEvents.push(body.id);
					}
					if (m.ReceiptHandle) {
						await sqsClientService.client.send(
							new DeleteMessageCommand({
								QueueUrl: targetQueueUrl,
								ReceiptHandle: m.ReceiptHandle
							})
						);
					}
				}
			} while (msgs.length > 0);

			const uniqueEvents = new Set(receivedEvents);
			expect(uniqueEvents.size).toBe(receivedEvents.length);
		} finally {
			await app2.close();
		}
	});

	it('should queue out-of-order REFUND as PENDING_REFERENCE and resolve it once BET arrives', async () => {
		const playerId = crypto.randomUUID();
		const wallet = await RequestContext.create(entityManager, async () =>
			createWalletUseCase.execute({
				playerId,
				initialBalance: { amount: '100.00', currency: 'BRL' }
			})
		);

		const missingBetExternalId = `ext-bet-missing-${crypto.randomUUID()}`;

		const pendingRefund = await RequestContext.create(entityManager, async () =>
			processWagerUseCase.execute({
				idempotencyKey: `${playerId}:ooo-refund-1`,
				providerId: 'provider-test',
				externalTransactionId: `ext-refund-${crypto.randomUUID()}`,
				referenceExternalTransactionId: missingBetExternalId,
				playerId,
				walletId: wallet.id,
				roundId: 'round-ooo-1',
				gameId: 'game-ooo',
				kind: WagerTransactionKind.Refund,
				money: { amount: '30.00', currency: 'BRL' }
			})
		);

		expect(pendingRefund.status).toBe(WagerTransactionStatus.PendingReference);

		const initialReconciliation = await RequestContext.create(entityManager, async () =>
			reconcileUseCase.execute({ walletId: wallet.id })
		);
		expect(initialReconciliation.consistent).toBe(true);
		expect(initialReconciliation.storedBalance.amount).toBe('100.00');
		expect(initialReconciliation.checkedEntries).toBe(1);

		const referenceBet = await RequestContext.create(entityManager, async () =>
			processWagerUseCase.execute({
				idempotencyKey: `${playerId}:reference-bet-1`,
				providerId: 'provider-test',
				externalTransactionId: missingBetExternalId,
				playerId,
				walletId: wallet.id,
				roundId: 'round-ooo-1',
				gameId: 'game-ooo',
				kind: WagerTransactionKind.Bet,
				money: { amount: '30.00', currency: 'BRL' }
			})
		);

		expect(referenceBet.status).toBe(WagerTransactionStatus.Processed);

		const afterBetReconciliation = await RequestContext.create(entityManager, async () =>
			reconcileUseCase.execute({ walletId: wallet.id })
		);
		expect(afterBetReconciliation.consistent).toBe(true);
		expect(afterBetReconciliation.storedBalance.amount).toBe('70.00');
		expect(afterBetReconciliation.checkedEntries).toBe(2);

		const resolvedCount = await RequestContext.create(entityManager, async () =>
			pendingReferenceWorker.processPendingReferences(10)
		);
		expect(resolvedCount).toBe(1);

		const updatedRefund = await RequestContext.create(entityManager, async () =>
			wageringRepository.findById(pendingRefund.transactionId)
		);
		expect(updatedRefund?.status).toBe(WagerTransactionStatus.Processed);
		expect(updatedRefund?.referenceTransactionId).toBe(referenceBet.transactionId);

		const finalReconciliation = await RequestContext.create(entityManager, async () =>
			reconcileUseCase.execute({ walletId: wallet.id })
		);
		expect(finalReconciliation.consistent).toBe(true);
		expect(finalReconciliation.storedBalance.amount).toBe('100.00');
		expect(finalReconciliation.calculatedBalance.amount).toBe('100.00');
		expect(finalReconciliation.checkedEntries).toBe(3);
	});
});
