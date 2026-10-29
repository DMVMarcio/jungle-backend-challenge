import { EntityManager } from '@mikro-orm/postgresql';
import { beforeEach, describe, expect, it } from 'bun:test';

import { MetricsService } from '@/core/observability/services/metrics.service';

import { InboxMemoryRepository } from '@/modules/inbox/infrastructure/database/inbox.memory.repository';
import { OutboxMemoryRepository } from '@/modules/outbox/infrastructure/database/outbox.memory.repository';
import {
	WagerTransaction,
	WagerTransactionKind,
	WagerTransactionStatus
} from '@/modules/wagering/domain/wager-transaction';
import { IdempotencyConflictError } from '@/modules/wagering/domain/wagering.errors';
import { WagerTransactionMemoryRepository } from '@/modules/wagering/infrastructure/database/wager-transaction.memory.repository';
import { Wallet } from '@/modules/wallet/domain/wallet';
import { LedgerDirection } from '@/modules/wallet/domain/wallet-ledger-entry';
import { WalletNotFoundError } from '@/modules/wallet/domain/wallet.errors';
import { WalletLedgerEntryMemoryRepository } from '@/modules/wallet/infrastructure/database/wallet-ledger-entry.memory.repository';
import { WalletMemoryRepository } from '@/modules/wallet/infrastructure/database/wallet.memory.repository';

import { IdGeneratorUuidAdapter } from '@/shared/adapters/id-generator/id-generator.uuid.adapter';
import { PayloadHasherSha256Adapter } from '@/shared/adapters/payload-hasher/payload-hasher.sha256.adapter';
import { Money } from '@/shared/domain/money/money';
import { CurrencyMismatchError } from '@/shared/domain/money/money.errors';

import { BetOperation } from '../operations/bet.operation';
import { LossOperation } from '../operations/loss.operation';
import { RefundOperation } from '../operations/refund.operation';
import { RollbackOperation } from '../operations/rollback.operation';
import { WinOperation } from '../operations/win.operation';
import { WageringOutboxService } from '../services/wagering-outbox.service';
import { ProcessWagerTransactionUseCase } from './process-wager-transaction.use-case';

describe('ProcessWagerTransactionUseCase', () => {
	let sut: ProcessWagerTransactionUseCase;

	let wageringRepository: WagerTransactionMemoryRepository;
	let walletRepository: WalletMemoryRepository;
	let ledgerRepository: WalletLedgerEntryMemoryRepository;
	let outboxRepository: OutboxMemoryRepository;
	let inboxRepository: InboxMemoryRepository;

	let idGenerator: IdGeneratorUuidAdapter;
	let payloadHasher: PayloadHasherSha256Adapter;
	let entityManager: EntityManager;

	const testWalletId = 'wallet-1';
	const testPlayerId = 'player-1';

	beforeEach(async () => {
		wageringRepository = new WagerTransactionMemoryRepository();
		walletRepository = new WalletMemoryRepository();
		ledgerRepository = new WalletLedgerEntryMemoryRepository();
		outboxRepository = new OutboxMemoryRepository();
		inboxRepository = new InboxMemoryRepository();

		idGenerator = new IdGeneratorUuidAdapter();
		payloadHasher = new PayloadHasherSha256Adapter();

		entityManager = {
			transactional: async <T>(cb: (em: EntityManager) => Promise<T>): Promise<T> => cb(entityManager)
		} as unknown as EntityManager;

		const outboxService = new WageringOutboxService(outboxRepository, idGenerator);
		const betOperation = new BetOperation();
		const winOperation = new WinOperation(wageringRepository);
		const lossOperation = new LossOperation();
		const refundOperation = new RefundOperation(wageringRepository);
		const rollbackOperation = new RollbackOperation(wageringRepository);
		const metricsService = new MetricsService();

		sut = new ProcessWagerTransactionUseCase(
			wageringRepository,
			walletRepository,
			ledgerRepository,
			idGenerator,
			payloadHasher,
			outboxService,
			betOperation,
			winOperation,
			lossOperation,
			refundOperation,
			rollbackOperation,
			entityManager,
			metricsService,
			inboxRepository
		);

		const wallet = Wallet.open({
			id: testWalletId,
			playerId: testPlayerId,
			initialBalance: Money.from({ amount: '100.00', currency: 'BRL' })
		});
		await walletRepository.create(wallet);
	});

	it('should process a BET with sufficient funds, debit balance, and produce ledger and outbox entries', async () => {
		const result = await sut.execute({
			idempotencyKey: 'idemp-bet-1',
			providerId: 'provider-a',
			externalTransactionId: 'transaction-bet-1',
			playerId: testPlayerId,
			walletId: testWalletId,
			roundId: 'round-1',
			gameId: 'game-1',
			kind: WagerTransactionKind.Bet,
			money: { amount: '30.00', currency: 'BRL' }
		});

		expect(result.status).toBe(WagerTransactionStatus.Processed);
		expect(result.balance).toEqual({ amount: '70.00', currency: 'BRL' });
		expect(result.idempotentReplay).toBe(false);

		const wallet = await walletRepository.findById(testWalletId);
		expect(wallet?.balance.toJSON()).toEqual({ amount: '70.00', currency: 'BRL' });

		const ledgerEntries = await ledgerRepository.findAllByWalletId(testWalletId);
		expect(ledgerEntries).toHaveLength(1);
		expect(ledgerEntries[0].direction).toBe(LedgerDirection.Debit);
		expect(ledgerEntries[0].money.toJSON()).toEqual({ amount: '30.00', currency: 'BRL' });

		expect(outboxRepository.items).toHaveLength(2);
		expect(outboxRepository.items.map(i => i.eventType)).toContain('WagerTransactionProcessed');
		expect(outboxRepository.items.map(i => i.eventType)).toContain('WalletBalanceChanged');
	});

	it('should reject a BET when balance is insufficient with INSUFFICIENT_FUNDS without altering balance or ledger', async () => {
		const result = await sut.execute({
			idempotencyKey: 'idemp-bet-2',
			providerId: 'provider-a',
			externalTransactionId: 'transaction-bet-2',
			playerId: testPlayerId,
			walletId: testWalletId,
			roundId: 'round-1',
			gameId: 'game-1',
			kind: WagerTransactionKind.Bet,
			money: { amount: '150.00', currency: 'BRL' }
		});

		expect(result.status).toBe(WagerTransactionStatus.Rejected);
		expect(result.failureCode).toBe('INSUFFICIENT_FUNDS');
		expect(result.balance).toEqual({ amount: '100.00', currency: 'BRL' });
		expect(result.idempotentReplay).toBe(false);

		const wallet = await walletRepository.findById(testWalletId);
		expect(wallet?.balance.toJSON()).toEqual({ amount: '100.00', currency: 'BRL' });

		const ledgerEntries = await ledgerRepository.findAllByWalletId(testWalletId);
		expect(ledgerEntries).toHaveLength(0);

		expect(outboxRepository.items).toHaveLength(1);
		expect(outboxRepository.items[0].eventType).toBe('WagerTransactionRejected');
	});

	it('should process a WIN, credit balance, and produce ledger and outbox entries', async () => {
		const result = await sut.execute({
			idempotencyKey: 'idemp-win-1',
			providerId: 'provider-a',
			externalTransactionId: 'transaction-win-1',
			playerId: testPlayerId,
			walletId: testWalletId,
			roundId: 'round-1',
			gameId: 'game-1',
			kind: WagerTransactionKind.Win,
			money: { amount: '50.00', currency: 'BRL' }
		});

		expect(result.status).toBe(WagerTransactionStatus.Processed);
		expect(result.balance).toEqual({ amount: '150.00', currency: 'BRL' });

		const wallet = await walletRepository.findById(testWalletId);
		expect(wallet?.balance.toJSON()).toEqual({ amount: '150.00', currency: 'BRL' });

		const ledgerEntries = await ledgerRepository.findAllByWalletId(testWalletId);
		expect(ledgerEntries).toHaveLength(1);
		expect(ledgerEntries[0].direction).toBe(LedgerDirection.Credit);

		expect(outboxRepository.items[0].eventType).toBe('WagerTransactionProcessed');
	});

	it('should validate and link referenceTransactionId when WIN provides referenceExternalTransactionId', async () => {
		const betResult = await sut.execute({
			idempotencyKey: 'idemp-bet-for-win',
			providerId: 'provider-a',
			externalTransactionId: 'transaction-bet-for-win',
			playerId: testPlayerId,
			walletId: testWalletId,
			roundId: 'round-win-ref',
			gameId: 'game-1',
			kind: WagerTransactionKind.Bet,
			money: { amount: '10.00', currency: 'BRL' }
		});

		const winResult = await sut.execute({
			idempotencyKey: 'idemp-win-with-ref',
			providerId: 'provider-a',
			externalTransactionId: 'transaction-win-with-ref',
			playerId: testPlayerId,
			walletId: testWalletId,
			roundId: 'round-win-ref',
			gameId: 'game-1',
			kind: WagerTransactionKind.Win,
			money: { amount: '40.00', currency: 'BRL' },
			referenceExternalTransactionId: 'transaction-bet-for-win'
		});

		expect(winResult.status).toBe(WagerTransactionStatus.Processed);
		expect(winResult.balance).toEqual({ amount: '130.00', currency: 'BRL' });

		const winTx = await wageringRepository.findById(winResult.transactionId);
		expect(winTx?.referenceTransactionId).toBe(betResult.transactionId);

		const invalidWinResult = await sut.execute({
			idempotencyKey: 'idemp-win-wrong-round',
			providerId: 'provider-a',
			externalTransactionId: 'transaction-win-wrong-round',
			playerId: testPlayerId,
			walletId: testWalletId,
			roundId: 'different-round',
			gameId: 'game-1',
			kind: WagerTransactionKind.Win,
			money: { amount: '40.00', currency: 'BRL' },
			referenceExternalTransactionId: 'transaction-bet-for-win'
		});

		expect(invalidWinResult.status).toBe(WagerTransactionStatus.Rejected);
		expect(invalidWinResult.failureCode).toBe('REFERENCE_CONTEXT_MISMATCH');
	});

	it('should process a LOSS without changing balance or ledger', async () => {
		const result = await sut.execute({
			idempotencyKey: 'idemp-loss-1',
			providerId: 'provider-a',
			externalTransactionId: 'transaction-loss-1',
			playerId: testPlayerId,
			walletId: testWalletId,
			roundId: 'round-1',
			gameId: 'game-1',
			kind: WagerTransactionKind.Loss,
			money: { amount: '25.00', currency: 'BRL' }
		});

		expect(result.status).toBe(WagerTransactionStatus.Processed);
		expect(result.balance).toEqual({ amount: '100.00', currency: 'BRL' });

		const ledgerEntries = await ledgerRepository.findAllByWalletId(testWalletId);
		expect(ledgerEntries).toHaveLength(0);

		expect(outboxRepository.items[0].eventType).toBe('WagerTransactionProcessed');
	});

	it('should return original result on idempotent replay with idempotentReplay: true', async () => {
		const input = {
			idempotencyKey: 'idemp-bet-replay',
			providerId: 'provider-a',
			externalTransactionId: 'transaction-bet-replay',
			playerId: testPlayerId,
			walletId: testWalletId,
			roundId: 'round-1',
			gameId: 'game-1',
			kind: WagerTransactionKind.Bet,
			money: { amount: '40.00', currency: 'BRL' }
		};

		const firstResult = await sut.execute(input);
		expect(firstResult.status).toBe(WagerTransactionStatus.Processed);
		expect(firstResult.idempotentReplay).toBe(false);

		const secondResult = await sut.execute(input);
		expect(secondResult.transactionId).toBe(firstResult.transactionId);
		expect(secondResult.status).toBe(WagerTransactionStatus.Processed);
		expect(secondResult.balance).toEqual({ amount: '60.00', currency: 'BRL' });
		expect(secondResult.idempotentReplay).toBe(true);

		const ledgerEntries = await ledgerRepository.findAllByWalletId(testWalletId);
		expect(ledgerEntries).toHaveLength(1);
	});

	it('should replay LOSS with historical balance even after subsequent balance changes', async () => {
		const lossInput = {
			idempotencyKey: 'idemp-loss-historical',
			providerId: 'provider-a',
			externalTransactionId: 'transaction-loss-historical',
			playerId: testPlayerId,
			walletId: testWalletId,
			roundId: 'round-1',
			gameId: 'game-1',
			kind: WagerTransactionKind.Loss,
			money: { amount: '10.00', currency: 'BRL' }
		};

		const lossResult = await sut.execute(lossInput);
		expect(lossResult.status).toBe(WagerTransactionStatus.Processed);
		expect(lossResult.balance).toEqual({ amount: '100.00', currency: 'BRL' });

		await sut.execute({
			idempotencyKey: 'idemp-subsequent-bet',
			providerId: 'provider-a',
			externalTransactionId: 'transaction-subsequent-bet',
			playerId: testPlayerId,
			walletId: testWalletId,
			roundId: 'round-2',
			gameId: 'game-1',
			kind: WagerTransactionKind.Bet,
			money: { amount: '30.00', currency: 'BRL' }
		});

		const replayLossResult = await sut.execute(lossInput);
		expect(replayLossResult.idempotentReplay).toBe(true);
		expect(replayLossResult.balance).toEqual({ amount: '100.00', currency: 'BRL' });
	});

	it('should throw IdempotencyConflictError when same key is sent with different payload', async () => {
		await sut.execute({
			idempotencyKey: 'idemp-key-conflict',
			providerId: 'provider-a',
			externalTransactionId: 'transaction-1',
			playerId: testPlayerId,
			walletId: testWalletId,
			roundId: 'round-1',
			gameId: 'game-1',
			kind: WagerTransactionKind.Bet,
			money: { amount: '10.00', currency: 'BRL' }
		});

		expect(
			sut.execute({
				idempotencyKey: 'idemp-key-conflict',
				providerId: 'provider-a',
				externalTransactionId: 'transaction-1',
				playerId: testPlayerId,
				walletId: testWalletId,
				roundId: 'round-2',
				gameId: 'game-1',
				kind: WagerTransactionKind.Bet,
				money: { amount: '10.00', currency: 'BRL' }
			})
		).rejects.toBeInstanceOf(IdempotencyConflictError);
	});

	it('should mark REFUND as PENDING_REFERENCE when reference transaction is not in database', async () => {
		const result = await sut.execute({
			idempotencyKey: 'idemp-refund-pending',
			providerId: 'provider-a',
			externalTransactionId: 'transaction-refund-1',
			playerId: testPlayerId,
			walletId: testWalletId,
			roundId: 'round-1',
			gameId: 'game-1',
			kind: WagerTransactionKind.Refund,
			money: { amount: '20.00', currency: 'BRL' },
			referenceExternalTransactionId: 'transaction-not-found'
		});

		expect(result.status).toBe(WagerTransactionStatus.PendingReference);
		expect(result.balance).toEqual({ amount: '100.00', currency: 'BRL' });

		const ledgerEntries = await ledgerRepository.findAllByWalletId(testWalletId);
		expect(ledgerEntries).toHaveLength(0);
	});

	it('should process REFUND when reference BET is found, crediting wallet', async () => {
		await sut.execute({
			idempotencyKey: 'idemp-bet-ref',
			providerId: 'provider-a',
			externalTransactionId: 'transaction-bet-original',
			playerId: testPlayerId,
			walletId: testWalletId,
			roundId: 'round-1',
			gameId: 'game-1',
			kind: WagerTransactionKind.Bet,
			money: { amount: '25.00', currency: 'BRL' }
		});

		const walletBefore = await walletRepository.findById(testWalletId);
		expect(walletBefore?.balance.toJSON()).toEqual({ amount: '75.00', currency: 'BRL' });

		const refundResult = await sut.execute({
			idempotencyKey: 'idemp-refund-done',
			providerId: 'provider-a',
			externalTransactionId: 'transaction-refund-done',
			playerId: testPlayerId,
			walletId: testWalletId,
			roundId: 'round-1',
			gameId: 'game-1',
			kind: WagerTransactionKind.Refund,
			money: { amount: '25.00', currency: 'BRL' },
			referenceExternalTransactionId: 'transaction-bet-original'
		});

		expect(refundResult.status).toBe(WagerTransactionStatus.Processed);
		expect(refundResult.balance).toEqual({ amount: '100.00', currency: 'BRL' });

		const walletAfter = await walletRepository.findById(testWalletId);
		expect(walletAfter?.balance.toJSON()).toEqual({ amount: '100.00', currency: 'BRL' });
	});

	it('should reject duplicate REFUND or cross ROLLBACK on already reversed BET', async () => {
		await sut.execute({
			idempotencyKey: 'idemp-bet-dup',
			providerId: 'provider-a',
			externalTransactionId: 'transaction-bet-dup',
			playerId: testPlayerId,
			walletId: testWalletId,
			roundId: 'round-1',
			gameId: 'game-1',
			kind: WagerTransactionKind.Bet,
			money: { amount: '20.00', currency: 'BRL' }
		});

		await sut.execute({
			idempotencyKey: 'idemp-refund-1',
			providerId: 'provider-a',
			externalTransactionId: 'transaction-refund-1',
			playerId: testPlayerId,
			walletId: testWalletId,
			roundId: 'round-1',
			gameId: 'game-1',
			kind: WagerTransactionKind.Refund,
			money: { amount: '20.00', currency: 'BRL' },
			referenceExternalTransactionId: 'transaction-bet-dup'
		});

		const secondRefund = await sut.execute({
			idempotencyKey: 'idemp-refund-2',
			providerId: 'provider-a',
			externalTransactionId: 'transaction-refund-2',
			playerId: testPlayerId,
			walletId: testWalletId,
			roundId: 'round-1',
			gameId: 'game-1',
			kind: WagerTransactionKind.Refund,
			money: { amount: '20.00', currency: 'BRL' },
			referenceExternalTransactionId: 'transaction-bet-dup'
		});

		expect(secondRefund.status).toBe(WagerTransactionStatus.Rejected);
		expect(secondRefund.failureCode).toBe('REFERENCE_ALREADY_REVERSED');

		const crossRollback = await sut.execute({
			idempotencyKey: 'idemp-rollback-cross',
			providerId: 'provider-a',
			externalTransactionId: 'transaction-rollback-cross',
			playerId: testPlayerId,
			walletId: testWalletId,
			roundId: 'round-1',
			gameId: 'game-1',
			kind: WagerTransactionKind.Rollback,
			money: { amount: '20.00', currency: 'BRL' },
			referenceExternalTransactionId: 'transaction-bet-dup'
		});

		expect(crossRollback.status).toBe(WagerTransactionStatus.Rejected);
		expect(crossRollback.failureCode).toBe('REFERENCE_ALREADY_REVERSED');
		expect(crossRollback.balance).toEqual({ amount: '100.00', currency: 'BRL' });
	});

	it('should reject ROLLBACK with NEGATIVE_BALANCE_PREVENTED if reversing a WIN would make balance negative', async () => {
		const zeroWallet = Wallet.open({
			id: 'wallet-zero',
			playerId: 'player-2',
			initialBalance: Money.zero('BRL')
		});
		await walletRepository.create(zeroWallet);

		await sut.execute({
			idempotencyKey: 'idemp-win-roll',
			providerId: 'provider-a',
			externalTransactionId: 'transaction-win-roll',
			playerId: 'player-2',
			walletId: 'wallet-zero',
			roundId: 'round-1',
			gameId: 'game-1',
			kind: WagerTransactionKind.Win,
			money: { amount: '50.00', currency: 'BRL' }
		});

		await sut.execute({
			idempotencyKey: 'idemp-bet-spend',
			providerId: 'provider-a',
			externalTransactionId: 'transaction-bet-spend',
			playerId: 'player-2',
			walletId: 'wallet-zero',
			roundId: 'round-1',
			gameId: 'game-1',
			kind: WagerTransactionKind.Bet,
			money: { amount: '40.00', currency: 'BRL' }
		});

		const rollbackResult = await sut.execute({
			idempotencyKey: 'idemp-roll-fail',
			providerId: 'provider-a',
			externalTransactionId: 'transaction-roll-fail',
			playerId: 'player-2',
			walletId: 'wallet-zero',
			roundId: 'round-1',
			gameId: 'game-1',
			kind: WagerTransactionKind.Rollback,
			money: { amount: '50.00', currency: 'BRL' },
			referenceExternalTransactionId: 'transaction-win-roll'
		});

		expect(rollbackResult.status).toBe(WagerTransactionStatus.Rejected);
		expect(rollbackResult.failureCode).toBe('NEGATIVE_BALANCE_PREVENTED');
		expect(rollbackResult.balance).toEqual({ amount: '10.00', currency: 'BRL' });
	});

	it('should record and mark inbox message as processed when inboxMessage is provided', async () => {
		const result = await sut.execute({
			idempotencyKey: 'idemp-inbox-1',
			providerId: 'provider-a',
			externalTransactionId: 'transaction-inbox-1',
			playerId: testPlayerId,
			walletId: testWalletId,
			roundId: 'round-1',
			gameId: 'game-1',
			kind: WagerTransactionKind.Bet,
			money: { amount: '15.00', currency: 'BRL' },
			inboxMessage: {
				messageId: 'msg-sqs-100',
				consumerName: 'WagerTransactionConsumer'
			}
		});

		expect(result.status).toBe(WagerTransactionStatus.Processed);
		expect(inboxRepository.items).toHaveLength(1);
		const savedInbox = inboxRepository.items[0];
		expect(savedInbox.messageId).toBe('msg-sqs-100');
		expect(savedInbox.consumerName).toBe('WagerTransactionConsumer');
		expect(savedInbox.processedAt).toBeDefined();
	});

	it('should throw WalletNotFoundError when wallet does not exist', async () => {
		expect(
			sut.execute({
				idempotencyKey: 'idemp-no-wallet',
				providerId: 'provider-a',
				externalTransactionId: 'transaction-no-wallet',
				playerId: testPlayerId,
				walletId: '00000000-0000-0000-0000-000000000000',
				roundId: 'round-1',
				gameId: 'game-1',
				kind: WagerTransactionKind.Bet,
				money: { amount: '10.00', currency: 'BRL' }
			})
		).rejects.toBeInstanceOf(WalletNotFoundError);
	});

	it('should throw CurrencyMismatchError when currency does not match wallet currency', async () => {
		expect(
			sut.execute({
				idempotencyKey: 'idemp-currency',
				providerId: 'provider-a',
				externalTransactionId: 'transaction-currency',
				playerId: testPlayerId,
				walletId: testWalletId,
				roundId: 'round-1',
				gameId: 'game-1',
				kind: WagerTransactionKind.Bet,
				money: { amount: '10.00', currency: 'USD' }
			})
		).rejects.toBeInstanceOf(CurrencyMismatchError);
	});

	it('should mark WIN as PENDING_REFERENCE when reference transaction has not arrived yet', async () => {
		const winResult = await sut.execute({
			idempotencyKey: 'idemp-win-out-of-order',
			providerId: 'provider-a',
			externalTransactionId: 'transaction-win-out-of-order',
			playerId: testPlayerId,
			walletId: testWalletId,
			roundId: 'round-ooo',
			gameId: 'game-1',
			kind: WagerTransactionKind.Win,
			money: { amount: '75.00', currency: 'BRL' },
			referenceExternalTransactionId: 'transaction-bet-ooo-missing'
		});

		expect(winResult.status).toBe(WagerTransactionStatus.PendingReference);
		expect(winResult.balance).toEqual({ amount: '100.00', currency: 'BRL' });

		const ledgerEntries = await ledgerRepository.findAllByWalletId(testWalletId);
		expect(ledgerEntries).toHaveLength(0);

		const savedTx = await wageringRepository.findById(winResult.transactionId);
		expect(savedTx?.status).toBe(WagerTransactionStatus.PendingReference);
	});

	it('should return REJECTED with REFERENCE_ALREADY_REVERSED when concurrent reversal hits uq_wager_tx_single_reversal', async () => {
		const originalCreate = wageringRepository.create.bind(wageringRepository);
		let threw = false;
		wageringRepository.create = async (tx: WagerTransaction) => {
			if (!threw) {
				threw = true;
				const error = new Error(
					'duplicate key value violates unique constraint uq_wager_tx_single_reversal'
				) as Error & {
					code: string;
					constraint: string;
				};
				error.code = '23505';
				error.constraint = 'uq_wager_tx_single_reversal';
				throw error;
			}
			return originalCreate(tx);
		};

		const reversalResult = await sut.execute({
			idempotencyKey: 'idemp-concurrent-refund',
			providerId: 'provider-a',
			externalTransactionId: 'transaction-concurrent-refund',
			playerId: testPlayerId,
			walletId: testWalletId,
			roundId: 'round-1',
			gameId: 'game-1',
			kind: WagerTransactionKind.Refund,
			money: { amount: '20.00', currency: 'BRL' },
			referenceExternalTransactionId: 'some-reference'
		});

		expect(reversalResult.status).toBe(WagerTransactionStatus.Rejected);
		expect(reversalResult.failureCode).toBe('REFERENCE_ALREADY_REVERSED');
		expect(reversalResult.balance).toEqual({ amount: '100.00', currency: 'BRL' });
	});
});
