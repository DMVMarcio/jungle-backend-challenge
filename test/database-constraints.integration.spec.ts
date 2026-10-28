import { AppModule } from '@/app.module';
import { EntityManager, RequestContext } from '@mikro-orm/postgresql';
import { type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { CreateWalletUseCase } from '@/modules/wallet/application/use-cases/create-wallet.use-case';

import { startPostgresContainer, type TestPostgresContext } from './support/test-containers';

describe('Database Constraints', () => {
	let postgresContext: TestPostgresContext;
	let app: INestApplicationContext;
	let createWalletUseCase: CreateWalletUseCase;
	let entityManager: EntityManager;

	beforeAll(async () => {
		postgresContext = await startPostgresContainer();
		app = await NestFactory.createApplicationContext(AppModule, { logger: false });
		createWalletUseCase = app.get(CreateWalletUseCase);
		entityManager = app.get(EntityManager);
	}, 30000);

	afterAll(async () => {
		await app?.close();
		await postgresContext?.stop();
	}, 30000);

	it('should prevent UPDATE on wallet_ledger_entries via trigger', async () => {
		const playerId = crypto.randomUUID();
		const wallet = await RequestContext.create(entityManager, async () =>
			createWalletUseCase.execute({
				playerId,
				initialBalance: { amount: '100.00', currency: 'BRL' }
			})
		);

		await RequestContext.create(entityManager, async () => {
			const connection = entityManager.getConnection();
			expect(
				connection.execute(
					`UPDATE wallet_ledger_entries SET amount = 999.00 WHERE wallet_id = ?`,
					[wallet.id]
				)
			).rejects.toThrow(/append-only/i);
		});
	});

	it('should prevent DELETE on wallet_ledger_entries via trigger', async () => {
		const playerId = crypto.randomUUID();
		const wallet = await RequestContext.create(entityManager, async () =>
			createWalletUseCase.execute({
				playerId,
				initialBalance: { amount: '50.00', currency: 'BRL' }
			})
		);

		await RequestContext.create(entityManager, async () => {
			const connection = entityManager.getConnection();
			expect(
				connection.execute(
					`DELETE FROM wallet_ledger_entries WHERE wallet_id = ?`,
					[wallet.id]
				)
			).rejects.toThrow(/append-only/i);
		});
	});

	it('should reject duplicate (wallet_id, transaction_id) in wallet_ledger_entries', async () => {
		const playerId = crypto.randomUUID();
		const wallet = await RequestContext.create(entityManager, async () =>
			createWalletUseCase.execute({
				playerId,
				initialBalance: { amount: '50.00', currency: 'BRL' }
			})
		);

		await RequestContext.create(entityManager, async () => {
			const connection = entityManager.getConnection();
			const entries = await connection.execute<Array<{ transaction_id: string }>>(
				`SELECT transaction_id FROM wallet_ledger_entries WHERE wallet_id = ?`,
				[wallet.id]
			);
			const duplicateId = crypto.randomUUID();
			const existingTxId = entries[0].transaction_id;

			expect(
				connection.execute(
					`INSERT INTO wallet_ledger_entries (id, wallet_id, transaction_id, direction, amount, balance_before, balance_after, currency)
					VALUES (?, ?, ?, 'CREDIT', 10.00, 50.00, 60.00, 'BRL')`,
					[duplicateId, wallet.id, existingTxId]
				)
			).rejects.toThrow();
		});
	});

	it('should reject second PROCESSED reversal for same reference_transaction_id via partial unique index', async () => {
		const playerId = crypto.randomUUID();
		const wallet = await RequestContext.create(entityManager, async () =>
			createWalletUseCase.execute({
				playerId,
				initialBalance: { amount: '100.00', currency: 'BRL' }
			})
		);

		await RequestContext.create(entityManager, async () => {
			const connection = entityManager.getConnection();
			const betTxId = crypto.randomUUID();
			const refund1Id = crypto.randomUUID();
			const rollback1Id = crypto.randomUUID();

			await connection.execute(
				`INSERT INTO wager_transactions (id, provider_id, external_transaction_id, idempotency_key, payload_hash, wallet_id, player_id, round_id, game_id, kind, amount, currency, status)
				VALUES (?, 'provider-test', 'ext-bet', 'idemp-bet', 'hash', ?, ?, 'round-1', 'game-1', 'BET', 20.00, 'BRL', 'PROCESSED')`,
				[betTxId, wallet.id, playerId]
			);

			await connection.execute(
				`INSERT INTO wager_transactions (id, provider_id, external_transaction_id, idempotency_key, payload_hash, wallet_id, player_id, round_id, game_id, kind, amount, currency, status, reference_transaction_id)
				VALUES (?, 'provider-test', 'ext-ref-1', 'idemp-ref-1', 'hash', ?, ?, 'round-1', 'game-1', 'REFUND', 20.00, 'BRL', 'PROCESSED', ?)`,
				[refund1Id, wallet.id, playerId, betTxId]
			);

			expect(
				connection.execute(
					`INSERT INTO wager_transactions (id, provider_id, external_transaction_id, idempotency_key, payload_hash, wallet_id, player_id, round_id, game_id, kind, amount, currency, status, reference_transaction_id)
					VALUES (?, 'provider-test', 'ext-roll-1', 'idemp-roll-1', 'hash', ?, ?, 'round-1', 'game-1', 'ROLLBACK', 20.00, 'BRL', 'PROCESSED', ?)`,
					[rollback1Id, wallet.id, playerId, betTxId]
				)
			).rejects.toThrow();
		});
	});

	it('should reject unbalanced arithmetic in wallet_ledger_entries', async () => {
		const playerId = crypto.randomUUID();
		const wallet = await RequestContext.create(entityManager, async () =>
			createWalletUseCase.execute({
				playerId,
				initialBalance: { amount: '10.00', currency: 'BRL' }
			})
		);

		await RequestContext.create(entityManager, async () => {
			const connection = entityManager.getConnection();
			const entryId = crypto.randomUUID();
			const txId = crypto.randomUUID();

			expect(
				connection.execute(
					`INSERT INTO wallet_ledger_entries (id, wallet_id, transaction_id, direction, amount, balance_before, balance_after, currency)
					VALUES (?, ?, ?, 'CREDIT', 10.00, 10.00, 999.00, 'BRL')`,
					[entryId, wallet.id, txId]
				)
			).rejects.toThrow();
		});
	});
});
