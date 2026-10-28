import { AppModule } from '@/app.module';
import { EntityManager, RequestContext } from '@mikro-orm/postgresql';
import { type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { ProcessWagerTransactionUseCase } from '@/modules/wagering/application/use-cases/process-wager-transaction.use-case';
import { WagerTransactionKind, WagerTransactionStatus } from '@/modules/wagering/domain/wager-transaction';
import { CreateWalletUseCase } from '@/modules/wallet/application/use-cases/create-wallet.use-case';
import { GetWalletLedgerUseCase } from '@/modules/wallet/application/use-cases/get-wallet-ledger.use-case';
import { ReconcileWalletUseCase } from '@/modules/wallet/application/use-cases/reconcile-wallet.use-case';
import { LedgerDirection } from '@/modules/wallet/domain/wallet-ledger-entry';

import { startPostgresContainer, type TestPostgresContext } from './support/test-containers';

describe('Concurrency and Isolation', () => {
	let postgresContext: TestPostgresContext;
	let app: INestApplicationContext;

	let createWalletUseCase: CreateWalletUseCase;
	let processWagerUseCase: ProcessWagerTransactionUseCase;
	let getLedgerUseCase: GetWalletLedgerUseCase;
	let reconcileUseCase: ReconcileWalletUseCase;

	let entityManager: EntityManager;

	beforeAll(async () => {
		postgresContext = await startPostgresContainer();

		app = await NestFactory.createApplicationContext(AppModule, { logger: false });

		createWalletUseCase = app.get(CreateWalletUseCase);
		processWagerUseCase = app.get(ProcessWagerTransactionUseCase);
		getLedgerUseCase = app.get(GetWalletLedgerUseCase);
		reconcileUseCase = app.get(ReconcileWalletUseCase);
		entityManager = app.get(EntityManager);
	}, 30000);

	afterAll(async () => {
		await app?.close();
		await postgresContext?.stop();
	}, 30000);

	it('should process one bet and reject the other when two concurrent bets exceed balance', async () => {
		const playerId = crypto.randomUUID();
		const wallet = await RequestContext.create(entityManager, async () =>
			createWalletUseCase.execute({
				playerId,
				initialBalance: { amount: '100.00', currency: 'BRL' }
			})
		);

		const bet1 = RequestContext.create(entityManager, async () =>
			processWagerUseCase.execute({
				idempotencyKey: `${playerId}:bet-1`,
				providerId: 'provider-test',
				externalTransactionId: `external-${crypto.randomUUID()}`,
				playerId,
				walletId: wallet.id,
				roundId: 'round-1',
				gameId: 'game-1',
				kind: WagerTransactionKind.Bet,
				money: { amount: '80.00', currency: 'BRL' }
			})
		);

		const bet2 = RequestContext.create(entityManager, async () =>
			processWagerUseCase.execute({
				idempotencyKey: `${playerId}:bet-2`,
				providerId: 'provider-test',
				externalTransactionId: `external-${crypto.randomUUID()}`,
				playerId,
				walletId: wallet.id,
				roundId: 'round-2',
				gameId: 'game-1',
				kind: WagerTransactionKind.Bet,
				money: { amount: '80.00', currency: 'BRL' }
			})
		);

		const [result1, result2] = await Promise.all([bet1, bet2]);

		const processed = [result1, result2].filter(r => r.status === WagerTransactionStatus.Processed);
		const rejected = [result1, result2].filter(r => r.status === WagerTransactionStatus.Rejected);

		expect(processed).toHaveLength(1);
		expect(rejected).toHaveLength(1);
		expect(rejected[0].failureCode).toBe('INSUFFICIENT_FUNDS');

		const ledger = await RequestContext.create(entityManager, async () =>
			getLedgerUseCase.execute({ walletId: wallet.id, limit: 50 })
		);
		const debitEntries = ledger.items.filter(entry => entry.direction === LedgerDirection.Debit);
		expect(debitEntries).toHaveLength(1);
		expect(debitEntries[0].amount.amount).toBe('80.00');

		const reconciliation = await RequestContext.create(entityManager, async () =>
			reconcileUseCase.execute({ walletId: wallet.id })
		);
		expect(reconciliation.consistent).toBe(true);
		expect(reconciliation.storedBalance.amount).toBe('20.00');
		expect(reconciliation.calculatedBalance.amount).toBe('20.00');
	});

	it('should process first request and replay remaining 49 on concurrent identical idempotency keys', async () => {
		const playerId = crypto.randomUUID();
		const wallet = await RequestContext.create(entityManager, async () =>
			createWalletUseCase.execute({
				playerId,
				initialBalance: { amount: '100.00', currency: 'BRL' }
			})
		);

		const idempotencyKey = `${playerId}:idemp-50-race`;
		const externalTransactionId = `ext-${crypto.randomUUID()}`;

		const requests = Array.from({ length: 50 }, () =>
			RequestContext.create(entityManager, async () =>
				processWagerUseCase.execute({
					idempotencyKey,
					providerId: 'provider-test',
					externalTransactionId,
					playerId,
					walletId: wallet.id,
					roundId: 'round-race-50',
					gameId: 'game-race',
					kind: WagerTransactionKind.Bet,
					money: { amount: '25.00', currency: 'BRL' }
				})
			)
		);

		const results = await Promise.all(requests);

		for (const result of results) {
			expect(result.status).toBe(WagerTransactionStatus.Processed);
			expect(result.balance.amount).toBe('75.00');
			expect(result.transactionId).toBe(results[0].transactionId);
		}

		const initialProcessing = results.filter(r => !r.idempotentReplay);
		const replays = results.filter(r => r.idempotentReplay);

		expect(initialProcessing).toHaveLength(1);
		expect(replays).toHaveLength(49);

		const ledger = await RequestContext.create(entityManager, async () =>
			getLedgerUseCase.execute({ walletId: wallet.id, limit: 50 })
		);
		const debitEntries = ledger.items.filter(entry => entry.direction === LedgerDirection.Debit);
		expect(debitEntries).toHaveLength(1);
		expect(debitEntries[0].amount.amount).toBe('25.00');

		const reconciliation = await RequestContext.create(entityManager, async () =>
			reconcileUseCase.execute({ walletId: wallet.id })
		);
		expect(reconciliation.consistent).toBe(true);
		expect(reconciliation.storedBalance.amount).toBe('75.00');
	});

	it('should prevent negative balance during concurrent distinct bet burst', async () => {
		const playerId = crypto.randomUUID();
		const wallet = await RequestContext.create(entityManager, async () =>
			createWalletUseCase.execute({
				playerId,
				initialBalance: { amount: '100.00', currency: 'BRL' }
			})
		);

		const requests = Array.from({ length: 10 }, (_, index) =>
			RequestContext.create(entityManager, async () =>
				processWagerUseCase.execute({
					idempotencyKey: `${playerId}:burst-${index + 1}`,
					providerId: 'provider-test',
					externalTransactionId: `ext-burst-${crypto.randomUUID()}`,
					playerId,
					walletId: wallet.id,
					roundId: `round-${index + 1}`,
					gameId: 'game-burst',
					kind: WagerTransactionKind.Bet,
					money: { amount: '25.00', currency: 'BRL' }
				})
			)
		);

		const results = await Promise.all(requests);

		const processed = results.filter(r => r.status === WagerTransactionStatus.Processed);
		const rejected = results.filter(r => r.status === WagerTransactionStatus.Rejected);

		expect(processed).toHaveLength(4);
		expect(rejected).toHaveLength(6);

		for (const r of rejected) {
			expect(r.failureCode).toBe('INSUFFICIENT_FUNDS');
		}

		const ledger = await RequestContext.create(entityManager, async () =>
			getLedgerUseCase.execute({ walletId: wallet.id, limit: 50 })
		);

		const debitEntries = ledger.items.filter(entry => entry.direction === LedgerDirection.Debit);
		expect(debitEntries).toHaveLength(4);

		const reconciliation = await RequestContext.create(entityManager, async () =>
			reconcileUseCase.execute({ walletId: wallet.id })
		);

		expect(reconciliation.consistent).toBe(true);
		expect(reconciliation.storedBalance.amount).toBe('0.00');
		expect(reconciliation.calculatedBalance.amount).toBe('0.00');
	});
});
