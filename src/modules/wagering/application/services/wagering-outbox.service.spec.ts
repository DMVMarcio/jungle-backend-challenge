import { beforeEach, describe, expect, it } from 'bun:test';

import { RequestContextService } from '@/core/observability/services/request-context.service';

import { OutboxMemoryRepository } from '@/modules/outbox/infrastructure/database/outbox.memory.repository';
import { WagerTransaction, WagerTransactionKind } from '@/modules/wagering/domain/wager-transaction';
import { Wallet } from '@/modules/wallet/domain/wallet';
import { LedgerDirection, WalletLedgerEntry } from '@/modules/wallet/domain/wallet-ledger-entry';

import { IdGeneratorUuidAdapter } from '@/shared/adapters/id-generator/id-generator.uuid.adapter';
import { Money } from '@/shared/domain/money/money';

import { WageringOutboxService } from './wagering-outbox.service';

describe('Wagering Outbox Service', () => {
	let sut: WageringOutboxService;
	let outboxRepository: OutboxMemoryRepository;
	let idGenerator: IdGeneratorUuidAdapter;
	let requestContextService: RequestContextService;

	beforeEach(() => {
		outboxRepository = new OutboxMemoryRepository();
		idGenerator = new IdGeneratorUuidAdapter();
		requestContextService = new RequestContextService();

		sut = new WageringOutboxService(outboxRepository, idGenerator, requestContextService);
	});

	it('should emit WagerTransactionProcessed and WalletBalanceChanged on processed bet', async () => {
		const wallet = Wallet.open({
			id: 'wallet-1',
			playerId: 'player-1',
			initialBalance: Money.from({ amount: '100.00', currency: 'BRL' })
		});

		const transaction = WagerTransaction.create({
			id: 'tx-1',
			providerId: 'provider-1',
			externalTransactionId: 'ext-1',
			idempotencyKey: 'idemp-1',
			payloadHash: 'hash-1',
			playerId: 'player-1',
			walletId: 'wallet-1',
			roundId: 'round-1',
			gameId: 'game-1',
			kind: WagerTransactionKind.Bet,
			money: Money.from({ amount: '25.00', currency: 'BRL' })
		});
		transaction.markProcessed();

		const ledgerEntry = WalletLedgerEntry.create({
			id: 'ledger-1',
			walletId: 'wallet-1',
			transactionId: 'tx-1',
			direction: LedgerDirection.Debit,
			money: Money.from({ amount: '25.00', currency: 'BRL' }),
			balanceBefore: Money.from({ amount: '100.00', currency: 'BRL' }),
			balanceAfter: Money.from({ amount: '75.00', currency: 'BRL' })
		});

		await requestContextService.runWithContext(
			{ correlationId: 'corr-123', causationId: 'cause-456' },
			async () => {
				await sut.enqueue(transaction, wallet, ledgerEntry);
			}
		);

		expect(outboxRepository.items).toHaveLength(2);

		const processedEvent = outboxRepository.items.find(e => e.eventType === 'WagerTransactionProcessed');
		expect(processedEvent).toBeDefined();
		expect(processedEvent?.aggregateId).toBe('tx-1');
		expect(processedEvent?.payload.correlationId).toBe('corr-123');
		expect(processedEvent?.payload.causationId).toBe('cause-456');

		const balanceChangedEvent = outboxRepository.items.find(e => e.eventType === 'WalletBalanceChanged');
		expect(balanceChangedEvent).toBeDefined();
		expect(balanceChangedEvent?.aggregateId).toBe('wallet-1');
		expect(balanceChangedEvent?.payload.correlationId).toBe('corr-123');
		expect(balanceChangedEvent?.payload.causationId).toBe('tx-1');
	});

	it('should emit only WagerTransactionProcessed without WalletBalanceChanged for LOSS', async () => {
		const wallet = Wallet.open({
			id: 'wallet-1',
			playerId: 'player-1',
			initialBalance: Money.from({ amount: '100.00', currency: 'BRL' })
		});

		const transaction = WagerTransaction.create({
			id: 'tx-loss-1',
			providerId: 'provider-1',
			externalTransactionId: 'ext-loss-1',
			idempotencyKey: 'idemp-loss-1',
			payloadHash: 'hash-loss-1',
			playerId: 'player-1',
			walletId: 'wallet-1',
			roundId: 'round-1',
			gameId: 'game-1',
			kind: WagerTransactionKind.Loss,
			money: Money.from({ amount: '0.00', currency: 'BRL' })
		});
		transaction.markProcessed();

		await sut.enqueue(transaction, wallet, undefined);

		expect(outboxRepository.items).toHaveLength(1);
		expect(outboxRepository.items[0].eventType).toBe('WagerTransactionProcessed');
	});

	it('should emit WagerTransactionRejected when transaction is rejected', async () => {
		const transaction = WagerTransaction.create({
			id: 'tx-rej-1',
			providerId: 'provider-1',
			externalTransactionId: 'ext-rej-1',
			idempotencyKey: 'idemp-rej-1',
			payloadHash: 'hash-rej-1',
			playerId: 'player-1',
			walletId: 'wallet-1',
			roundId: 'round-1',
			gameId: 'game-1',
			kind: WagerTransactionKind.Bet,
			money: Money.from({ amount: '200.00', currency: 'BRL' })
		});
		transaction.reject('INSUFFICIENT_FUNDS');

		await sut.enqueue(transaction);

		expect(outboxRepository.items).toHaveLength(1);
		const event = outboxRepository.items[0];
		expect(event.eventType).toBe('WagerTransactionRejected');
		expect(event.aggregateId).toBe('tx-rej-1');
		expect(event.payload.data).toEqual(
			expect.objectContaining({
				failureCode: 'INSUFFICIENT_FUNDS',
				transactionId: 'tx-rej-1'
			})
		);
	});

	it('should emit WagerTransactionPendingReference when transaction is pending reference', async () => {
		const transaction = WagerTransaction.create({
			id: 'tx-pending-1',
			providerId: 'provider-1',
			externalTransactionId: 'ext-pending-1',
			idempotencyKey: 'idemp-pending-1',
			payloadHash: 'hash-pending-1',
			playerId: 'player-1',
			walletId: 'wallet-1',
			roundId: 'round-1',
			gameId: 'game-1',
			kind: WagerTransactionKind.Rollback,
			money: Money.from({ amount: '50.00', currency: 'BRL' }),
			referenceExternalTransactionId: 'missing-ext-ref'
		});
		transaction.markPendingReference();

		await sut.enqueue(transaction);

		expect(outboxRepository.items).toHaveLength(1);
		const event = outboxRepository.items[0];
		expect(event.eventType).toBe('WagerTransactionPendingReference');
		expect(event.aggregateId).toBe('tx-pending-1');
		expect(event.payload.data).toEqual(
			expect.objectContaining({
				referenceExternalTransactionId: 'missing-ext-ref',
				transactionId: 'tx-pending-1'
			})
		);
	});
});
