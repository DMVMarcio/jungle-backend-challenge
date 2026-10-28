import { EntityManager } from '@mikro-orm/postgresql';
import { beforeEach, describe, expect, it } from 'bun:test';

import { RequestContextService } from '@/core/observability/services/request-context.service';
import { OutboxMemoryRepository } from '@/modules/outbox/infrastructure/database/outbox.memory.repository';
import { WagerTransactionKind, WagerTransactionStatus } from '@/modules/wagering/domain/wager-transaction';
import { WagerTransactionMemoryRepository } from '@/modules/wagering/infrastructure/database/wager-transaction.memory.repository';
import { IdGeneratorUuidAdapter } from '@/shared/adapters/id-generator/id-generator.uuid.adapter';

import { LedgerDirection } from '../../domain/wallet-ledger-entry';
import { WalletAlreadyExistsError } from '../../domain/wallet.errors';
import { WalletLedgerEntryMemoryRepository } from '../../infrastructure/database/wallet-ledger-entry.memory.repository';
import { WalletMemoryRepository } from '../../infrastructure/database/wallet.memory.repository';
import { CreateWalletUseCase } from './create-wallet.use-case';

describe('Create Wallet UseCase', () => {
	let sut: CreateWalletUseCase;

	let walletRepository: WalletMemoryRepository;
	let ledgerRepository: WalletLedgerEntryMemoryRepository;
	let wageringRepository: WagerTransactionMemoryRepository;
	let outboxRepository: OutboxMemoryRepository;

	let idGenerator: IdGeneratorUuidAdapter;
	let requestContextService: RequestContextService;
	let entityManager: EntityManager;

	beforeEach(() => {
		walletRepository = new WalletMemoryRepository();
		ledgerRepository = new WalletLedgerEntryMemoryRepository();
		wageringRepository = new WagerTransactionMemoryRepository();
		outboxRepository = new OutboxMemoryRepository();

		idGenerator = new IdGeneratorUuidAdapter();
		requestContextService = new RequestContextService();

		entityManager = {
			transactional: async <T>(cb: (em: EntityManager) => Promise<T>): Promise<T> => cb(entityManager)
		} as unknown as EntityManager;

		sut = new CreateWalletUseCase(
			walletRepository,
			ledgerRepository,
			wageringRepository,
			outboxRepository,
			idGenerator,
			requestContextService,
			entityManager
		);
	});

	it('should create a wallet with zero balance without creating ledger or opening transaction', async () => {
		const output = await sut.execute({
			playerId: 'player-1',
			initialBalance: { amount: '0.00', currency: 'BRL' }
		});

		expect(output.playerId).toBe('player-1');
		expect(output.balance).toEqual({ amount: '0.00', currency: 'BRL' });
		expect(output.version).toBe(1);

		const savedWallet = await walletRepository.findById(output.id);

		expect(savedWallet).not.toBeNull();
		expect(ledgerRepository.items).toHaveLength(0);
		expect(wageringRepository.items).toHaveLength(0);
		expect(outboxRepository.items).toHaveLength(0);
	});

	it('should create a wallet with positive balance, creating a CREDIT ledger entry, OPENING transaction and outbox event', async () => {
		const output = await sut.execute({
			playerId: 'player-1',
			initialBalance: { amount: '100.00', currency: 'BRL' }
		});

		expect(output.playerId).toBe('player-1');
		expect(output.balance).toEqual({ amount: '100.00', currency: 'BRL' });

		expect(ledgerRepository.items).toHaveLength(1);

		const ledger = ledgerRepository.items[0];

		expect(ledger.direction).toBe(LedgerDirection.Credit);
		expect(ledger.money.toJSON()).toEqual({ amount: '100.00', currency: 'BRL' });
		expect(ledger.balanceBefore.toJSON()).toEqual({ amount: '0.00', currency: 'BRL' });
		expect(ledger.balanceAfter.toJSON()).toEqual({ amount: '100.00', currency: 'BRL' });
		expect(wageringRepository.items).toHaveLength(1);

		const openingTransaction = wageringRepository.items[0];

		expect(openingTransaction.kind).toBe(WagerTransactionKind.Opening);
		expect(openingTransaction.status).toBe(WagerTransactionStatus.Processed);
		expect(openingTransaction.money.toJSON()).toEqual({ amount: '100.00', currency: 'BRL' });
		expect(openingTransaction.idempotencyKey).toBe(`opening:${output.id}`);

		expect(outboxRepository.items).toHaveLength(1);
		expect(outboxRepository.items[0].eventType).toBe('WalletBalanceChanged');
	});

	it('should throw WalletAlreadyExistsError when wallet already exists for player and currency', async () => {
		await sut.execute({
			playerId: 'player-1',
			initialBalance: { amount: '50.00', currency: 'BRL' }
		});

		expect(
			sut.execute({
				playerId: 'player-1',
				initialBalance: { amount: '100.00', currency: 'BRL' }
			})
		).rejects.toBeInstanceOf(WalletAlreadyExistsError);
	});
});
