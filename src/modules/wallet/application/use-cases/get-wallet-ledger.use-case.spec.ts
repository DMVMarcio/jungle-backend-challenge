import { beforeEach, describe, expect, it } from 'bun:test';

import { Wallet } from '@/modules/wallet/domain/wallet';
import { LedgerDirection, WalletLedgerEntry } from '@/modules/wallet/domain/wallet-ledger-entry';
import { WalletNotFoundError } from '@/modules/wallet/domain/wallet.errors';
import { WalletLedgerEntryMemoryRepository } from '@/modules/wallet/infrastructure/database/wallet-ledger-entry.memory.repository';
import { WalletMemoryRepository } from '@/modules/wallet/infrastructure/database/wallet.memory.repository';

import { Money } from '@/shared/domain/money/money';

import { GetWalletLedgerUseCase } from './get-wallet-ledger.use-case';

describe('GetWalletLedgerUseCase', () => {
	let walletRepository: WalletMemoryRepository;
	let ledgerRepository: WalletLedgerEntryMemoryRepository;
	let useCase: GetWalletLedgerUseCase;

	beforeEach(() => {
		walletRepository = new WalletMemoryRepository();
		ledgerRepository = new WalletLedgerEntryMemoryRepository();
		useCase = new GetWalletLedgerUseCase(walletRepository, ledgerRepository);
	});

	it('should throw WalletNotFoundError when wallet does not exist', async () => {
		expect(useCase.execute({ walletId: 'non-existing-wallet-id' })).rejects.toBeInstanceOf(WalletNotFoundError);
	});

	it('should return empty list when wallet has no ledger entries', async () => {
		const wallet = Wallet.open({
			id: 'wallet-1',
			playerId: 'player-1',
			initialBalance: Money.zero('BRL')
		});

		await walletRepository.create(wallet);

		const result = await useCase.execute({ walletId: 'wallet-1' });

		expect(result.items).toHaveLength(0);
		expect(result.nextCursor).toBeNull();
	});

	it('should return paginated ledger entries sorted newest first', async () => {
		const wallet = Wallet.open({
			id: 'wallet-1',
			playerId: 'player-1',
			initialBalance: Money.from({ amount: '100.00', currency: 'BRL' })
		});

		await walletRepository.create(wallet);

		const entry1 = WalletLedgerEntry.create({
			id: 'entry-1',
			walletId: 'wallet-1',
			transactionId: 'tx-1',
			direction: LedgerDirection.Credit,
			money: Money.from({ amount: '100.00', currency: 'BRL' }),
			balanceBefore: Money.zero('BRL'),
			balanceAfter: Money.from({ amount: '100.00', currency: 'BRL' }),
			createdAt: new Date('2026-01-01T10:00:00.000Z')
		});

		const entry2 = WalletLedgerEntry.create({
			id: 'entry-2',
			walletId: 'wallet-1',
			transactionId: 'tx-2',
			direction: LedgerDirection.Debit,
			money: Money.from({ amount: '30.00', currency: 'BRL' }),
			balanceBefore: Money.from({ amount: '100.00', currency: 'BRL' }),
			balanceAfter: Money.from({ amount: '70.00', currency: 'BRL' }),
			createdAt: new Date('2026-01-01T11:00:00.000Z')
		});

		await ledgerRepository.create(entry1);
		await ledgerRepository.create(entry2);

		const result = await useCase.execute({ walletId: 'wallet-1' });

		expect(result.items).toHaveLength(2);
		expect(result.items[0].id).toBe('entry-2');
		expect(result.items[0].direction).toBe(LedgerDirection.Debit);
		expect(result.items[0].amount).toEqual({ amount: '30.00', currency: 'BRL' });
		expect(result.items[0].balanceAfter).toEqual({ amount: '70.00', currency: 'BRL' });
		expect(result.items[1].id).toBe('entry-1');
		expect(result.nextCursor).toBeNull();
	});

	it('should handle pagination cursor when limit is reached', async () => {
		const wallet = Wallet.open({
			id: 'wallet-1',
			playerId: 'player-1',
			initialBalance: Money.zero('BRL')
		});

		await walletRepository.create(wallet);

		for (let i = 1; i <= 3; i++) {
			await ledgerRepository.create(
				WalletLedgerEntry.create({
					id: `entry-${i}`,
					walletId: 'wallet-1',
					transactionId: `tx-${i}`,
					direction: LedgerDirection.Credit,
					money: Money.from({ amount: '10.00', currency: 'BRL' }),
					balanceBefore: Money.from({ amount: `${(i - 1) * 10}.00`, currency: 'BRL' }),
					balanceAfter: Money.from({ amount: `${i * 10}.00`, currency: 'BRL' }),
					createdAt: new Date(`2026-01-01T10:0${i}:00.000Z`)
				})
			);
		}

		const firstPage = await useCase.execute({ walletId: 'wallet-1', limit: 2 });
		expect(firstPage.items).toHaveLength(2);
		expect(firstPage.items[0].id).toBe('entry-3');
		expect(firstPage.items[1].id).toBe('entry-2');
		expect(firstPage.nextCursor).not.toBeNull();

		const secondPage = await useCase.execute({
			walletId: 'wallet-1',
			limit: 2,
			cursor: firstPage.nextCursor!
		});
		expect(secondPage.items).toHaveLength(1);
		expect(secondPage.items[0].id).toBe('entry-1');
		expect(secondPage.nextCursor).toBeNull();
	});
});
