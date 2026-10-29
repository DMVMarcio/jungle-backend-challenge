import { EntityManager } from '@mikro-orm/postgresql';
import { beforeEach, describe, expect, it } from 'bun:test';

import { MetricsService } from '@/core/observability/services/metrics.service';

import { OutboxMemoryRepository } from '@/modules/outbox/infrastructure/database/outbox.memory.repository';
import {
	WagerTransaction,
	WagerTransactionKind,
	WagerTransactionStatus
} from '@/modules/wagering/domain/wager-transaction';
import { WagerTransactionMemoryRepository } from '@/modules/wagering/infrastructure/database/wager-transaction.memory.repository';
import { Wallet } from '@/modules/wallet/domain/wallet';
import { LedgerDirection } from '@/modules/wallet/domain/wallet-ledger-entry';
import { WalletLedgerEntryMemoryRepository } from '@/modules/wallet/infrastructure/database/wallet-ledger-entry.memory.repository';
import { WalletMemoryRepository } from '@/modules/wallet/infrastructure/database/wallet.memory.repository';

import { IdGeneratorUuidAdapter } from '@/shared/adapters/id-generator/id-generator.uuid.adapter';
import { Money } from '@/shared/domain/money/money';

import { RefundOperation } from '../../application/operations/refund.operation';
import { RollbackOperation } from '../../application/operations/rollback.operation';
import { WinOperation } from '../../application/operations/win.operation';
import { WageringOutboxService } from '../../application/services/wagering-outbox.service';
import { PendingReferenceWorker } from './pending-reference.worker';

describe('Pending Reference Worker', () => {
	let sut: PendingReferenceWorker;

	let wageringRepository: WagerTransactionMemoryRepository;
	let walletRepository: WalletMemoryRepository;
	let ledgerRepository: WalletLedgerEntryMemoryRepository;
	let outboxRepository: OutboxMemoryRepository;

	let entityManager: EntityManager;
	const testWalletId = 'wallet-1';
	const testPlayerId = 'player-1';

	beforeEach(async () => {
		wageringRepository = new WagerTransactionMemoryRepository();
		walletRepository = new WalletMemoryRepository();
		ledgerRepository = new WalletLedgerEntryMemoryRepository();
		outboxRepository = new OutboxMemoryRepository();

		entityManager = {
			transactional: async <T>(cb: (em: EntityManager) => Promise<T>): Promise<T> => cb(entityManager)
		} as unknown as EntityManager;

		const idGenerator = new IdGeneratorUuidAdapter();
		const outboxService = new WageringOutboxService(outboxRepository, idGenerator);
		const refundOperation = new RefundOperation(wageringRepository);
		const rollbackOperation = new RollbackOperation(wageringRepository);
		const winOperation = new WinOperation(wageringRepository);
		const metricsService = new MetricsService();

		sut = new PendingReferenceWorker(
			wageringRepository,
			walletRepository,
			ledgerRepository,
			outboxService,
			refundOperation,
			rollbackOperation,
			winOperation,
			entityManager,
			metricsService
		);

		const wallet = Wallet.open({
			id: testWalletId,
			playerId: testPlayerId,
			initialBalance: Money.from({ amount: '100.00', currency: 'BRL' })
		});
		await walletRepository.create(wallet);
	});

	it('should resolve a pending REFUND when reference BET is found in database', async () => {
		const betTransaction = WagerTransaction.create({
			id: 'transaction-bet-1',
			providerId: 'provider-a',
			externalTransactionId: 'external-bet-1',
			idempotencyKey: 'key-bet-1',
			payloadHash: 'hash-bet',
			walletId: testWalletId,
			playerId: testPlayerId,
			roundId: 'round-1',
			gameId: 'game-1',
			kind: WagerTransactionKind.Bet,
			money: Money.from({ amount: '30.00', currency: 'BRL' })
		});
		betTransaction.markProcessed();
		await wageringRepository.create(betTransaction);

		const refundTransaction = WagerTransaction.create({
			id: 'transaction-refund-1',
			providerId: 'provider-a',
			externalTransactionId: 'external-refund-1',
			idempotencyKey: 'key-refund-1',
			payloadHash: 'hash-refund',
			walletId: testWalletId,
			playerId: testPlayerId,
			roundId: 'round-1',
			gameId: 'game-1',
			kind: WagerTransactionKind.Refund,
			money: Money.from({ amount: '30.00', currency: 'BRL' }),
			referenceExternalTransactionId: 'external-bet-1'
		});
		refundTransaction.markPendingReference();
		await wageringRepository.create(refundTransaction);

		const resolvedCount = await sut.processPendingReferences(50, new Date());

		expect(resolvedCount).toBe(1);

		const updatedRefund = await wageringRepository.findById('transaction-refund-1');
		expect(updatedRefund?.status).toBe(WagerTransactionStatus.Processed);
		expect(updatedRefund?.referenceTransactionId).toBe('transaction-bet-1');

		const wallet = await walletRepository.findById(testWalletId);
		expect(wallet?.balance.toJSON()).toEqual({ amount: '130.00', currency: 'BRL' });

		const ledgerEntries = await ledgerRepository.findAllByWalletId(testWalletId);
		expect(ledgerEntries).toHaveLength(1);
		expect(ledgerEntries[0].direction).toBe(LedgerDirection.Credit);

		expect(outboxRepository.items).toHaveLength(2);
		expect(outboxRepository.items.map(i => i.eventType)).toContain('WagerTransactionProcessed');
		expect(outboxRepository.items.map(i => i.eventType)).toContain('WalletBalanceChanged');
	});

	it('should keep transaction as PENDING_REFERENCE when reference is still missing and TTL has not expired', async () => {
		const refundTransaction = WagerTransaction.create({
			id: 'transaction-refund-2',
			providerId: 'provider-a',
			externalTransactionId: 'external-refund-2',
			idempotencyKey: 'key-refund-2',
			payloadHash: 'hash-refund-2',
			walletId: testWalletId,
			playerId: testPlayerId,
			roundId: 'round-1',
			gameId: 'game-1',
			kind: WagerTransactionKind.Refund,
			money: Money.from({ amount: '20.00', currency: 'BRL' }),
			referenceExternalTransactionId: 'external-missing',
			createdAt: new Date('2026-10-28T12:00:00Z')
		});
		refundTransaction.markPendingReference();
		await wageringRepository.create(refundTransaction);

		const resolvedCount = await sut.processPendingReferences(50, new Date('2026-10-28T12:01:00Z'), 300000);

		expect(resolvedCount).toBe(0);

		const unchangedRefund = await wageringRepository.findById('transaction-refund-2');
		expect(unchangedRefund?.status).toBe(WagerTransactionStatus.PendingReference);

		const ledgerEntries = await ledgerRepository.findAllByWalletId(testWalletId);
		expect(ledgerEntries).toHaveLength(0);
		expect(outboxRepository.items).toHaveLength(0);
	});

	it('should mark transaction as REJECTED with REFERENCE_NOT_FOUND when TTL expires and reference is missing', async () => {
		const refundTransaction = WagerTransaction.create({
			id: 'transaction-refund-expired',
			providerId: 'provider-a',
			externalTransactionId: 'external-refund-expired',
			idempotencyKey: 'key-refund-expired',
			payloadHash: 'hash-refund-expired',
			walletId: testWalletId,
			playerId: testPlayerId,
			roundId: 'round-1',
			gameId: 'game-1',
			kind: WagerTransactionKind.Refund,
			money: Money.from({ amount: '20.00', currency: 'BRL' }),
			referenceExternalTransactionId: 'external-missing',
			createdAt: new Date('2026-10-28T12:00:00Z')
		});
		refundTransaction.markPendingReference();
		await wageringRepository.create(refundTransaction);

		const resolvedCount = await sut.processPendingReferences(50, new Date('2026-10-28T12:06:00Z'), 300000);

		expect(resolvedCount).toBe(1);

		const rejectedRefund = await wageringRepository.findById('transaction-refund-expired');
		expect(rejectedRefund?.status).toBe(WagerTransactionStatus.Rejected);
		expect(rejectedRefund?.failureCode).toBe('REFERENCE_NOT_FOUND');

		const ledgerEntries = await ledgerRepository.findAllByWalletId(testWalletId);
		expect(ledgerEntries).toHaveLength(0);

		expect(outboxRepository.items).toHaveLength(1);
		expect(outboxRepository.items[0].eventType).toBe('WagerTransactionRejected');
	});

	it('should resolve a pending ROLLBACK when reference BET is found', async () => {
		const betTransaction = WagerTransaction.create({
			id: 'transaction-bet-roll',
			providerId: 'provider-a',
			externalTransactionId: 'external-bet-roll',
			idempotencyKey: 'key-bet-roll',
			payloadHash: 'hash-bet-roll',
			walletId: testWalletId,
			playerId: testPlayerId,
			roundId: 'round-1',
			gameId: 'game-1',
			kind: WagerTransactionKind.Bet,
			money: Money.from({ amount: '50.00', currency: 'BRL' })
		});
		betTransaction.markProcessed();
		await wageringRepository.create(betTransaction);

		const rollbackTransaction = WagerTransaction.create({
			id: 'transaction-rollback-1',
			providerId: 'provider-a',
			externalTransactionId: 'external-rollback-1',
			idempotencyKey: 'key-rollback-1',
			payloadHash: 'hash-rollback-1',
			walletId: testWalletId,
			playerId: testPlayerId,
			roundId: 'round-1',
			gameId: 'game-1',
			kind: WagerTransactionKind.Rollback,
			money: Money.from({ amount: '50.00', currency: 'BRL' }),
			referenceExternalTransactionId: 'external-bet-roll'
		});
		rollbackTransaction.markPendingReference();
		await wageringRepository.create(rollbackTransaction);

		const resolvedCount = await sut.processPendingReferences(50, new Date());

		expect(resolvedCount).toBe(1);

		const updatedRollback = await wageringRepository.findById('transaction-rollback-1');
		expect(updatedRollback?.status).toBe(WagerTransactionStatus.Processed);

		const wallet = await walletRepository.findById(testWalletId);
		expect(wallet?.balance.toJSON()).toEqual({ amount: '150.00', currency: 'BRL' });
	});

	it('should skip transaction if it is no longer in PENDING_REFERENCE status', async () => {
		const refundTransaction = WagerTransaction.create({
			id: 'transaction-already-processed',
			providerId: 'provider-a',
			externalTransactionId: 'external-refund-dup',
			idempotencyKey: 'key-refund-dup',
			payloadHash: 'hash-refund-dup',
			walletId: testWalletId,
			playerId: testPlayerId,
			roundId: 'round-1',
			gameId: 'game-1',
			kind: WagerTransactionKind.Refund,
			money: Money.from({ amount: '10.00', currency: 'BRL' }),
			referenceExternalTransactionId: 'external-bet-1'
		});
		refundTransaction.markProcessed();
		await wageringRepository.create(refundTransaction);

		const resolvedCount = await sut.processPendingReferences(50, new Date());

		expect(resolvedCount).toBe(0);
	});

	it('should resolve a pending WIN when reference BET is found in database', async () => {
		const betTransaction = WagerTransaction.create({
			id: 'transaction-bet-for-win',
			providerId: 'provider-a',
			externalTransactionId: 'external-bet-for-win',
			idempotencyKey: 'key-bet-win',
			payloadHash: 'hash-bet-win',
			walletId: testWalletId,
			playerId: testPlayerId,
			roundId: 'round-win',
			gameId: 'game-1',
			kind: WagerTransactionKind.Bet,
			money: Money.from({ amount: '50.00', currency: 'BRL' })
		});
		betTransaction.markProcessed();
		await wageringRepository.create(betTransaction);

		const winTransaction = WagerTransaction.create({
			id: 'transaction-win-pending',
			providerId: 'provider-a',
			externalTransactionId: 'external-win-pending',
			idempotencyKey: 'key-win-pending',
			payloadHash: 'hash-win-pending',
			walletId: testWalletId,
			playerId: testPlayerId,
			roundId: 'round-win',
			gameId: 'game-1',
			kind: WagerTransactionKind.Win,
			money: Money.from({ amount: '120.00', currency: 'BRL' }),
			referenceExternalTransactionId: 'external-bet-for-win'
		});
		winTransaction.markPendingReference();
		await wageringRepository.create(winTransaction);

		const resolvedCount = await sut.processPendingReferences(50, new Date());
		expect(resolvedCount).toBe(1);

		const updatedWin = await wageringRepository.findById('transaction-win-pending');
		expect(updatedWin?.status).toBe(WagerTransactionStatus.Processed);
		expect(updatedWin?.referenceTransactionId).toBe('transaction-bet-for-win');

		const wallet = await walletRepository.findById(testWalletId);
		expect(wallet?.balance.toJSON()).toEqual({ amount: '220.00', currency: 'BRL' });
	});

	it('should track attempts and exponential backoff nextAttemptAt when reference is missing', async () => {
		const refundTransaction = WagerTransaction.create({
			id: 'transaction-backoff-test',
			providerId: 'provider-a',
			externalTransactionId: 'external-backoff-test',
			idempotencyKey: 'key-backoff-test',
			payloadHash: 'hash-backoff',
			walletId: testWalletId,
			playerId: testPlayerId,
			roundId: 'round-1',
			gameId: 'game-1',
			kind: WagerTransactionKind.Refund,
			money: Money.from({ amount: '15.00', currency: 'BRL' }),
			referenceExternalTransactionId: 'external-not-here',
			createdAt: new Date('2026-10-28T12:00:00Z')
		});
		refundTransaction.markPendingReference();
		await wageringRepository.create(refundTransaction);

		const now = new Date('2026-10-28T12:01:00Z');
		await sut.processPendingReferences(50, now);

		const updatedTx = await wageringRepository.findById('transaction-backoff-test');
		expect(updatedTx?.attempts).toBe(1);
		expect(updatedTx?.nextAttemptAt).toBeDefined();
		expect(updatedTx?.nextAttemptAt?.getTime()).toBe(now.getTime() + 1000);
	});

	it('should skip transactions whose nextAttemptAt is in the future', async () => {
		const refundTransaction = WagerTransaction.create({
			id: 'transaction-future-test',
			providerId: 'provider-a',
			externalTransactionId: 'external-future-test',
			idempotencyKey: 'key-future-test',
			payloadHash: 'hash-future',
			walletId: testWalletId,
			playerId: testPlayerId,
			roundId: 'round-1',
			gameId: 'game-1',
			kind: WagerTransactionKind.Refund,
			money: Money.from({ amount: '15.00', currency: 'BRL' }),
			referenceExternalTransactionId: 'external-future-ref',
			createdAt: new Date('2026-10-28T12:00:00Z')
		});
		refundTransaction.markPendingReference();
		refundTransaction.recordAttempt(new Date('2026-10-28T12:05:00Z'));
		await wageringRepository.create(refundTransaction);

		const resolvedCount = await sut.processPendingReferences(50, new Date('2026-10-28T12:01:00Z'));
		expect(resolvedCount).toBe(0);
	});
});
