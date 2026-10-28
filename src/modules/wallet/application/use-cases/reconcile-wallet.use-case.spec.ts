import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, spyOn } from 'bun:test';

import { Wallet } from '@/modules/wallet/domain/wallet';
import { LedgerDirection, WalletLedgerEntry } from '@/modules/wallet/domain/wallet-ledger-entry';
import { WalletNotFoundError } from '@/modules/wallet/domain/wallet.errors';
import { WalletLedgerEntryMemoryRepository } from '@/modules/wallet/infrastructure/database/wallet-ledger-entry.memory.repository';
import { WalletMemoryRepository } from '@/modules/wallet/infrastructure/database/wallet.memory.repository';

import { Money } from '@/shared/domain/money/money';

import { ReconcileWalletUseCase } from './reconcile-wallet.use-case';

describe('ReconcileWalletUseCase', () => {
	let walletRepository: WalletMemoryRepository;
	let ledgerRepository: WalletLedgerEntryMemoryRepository;
	let useCase: ReconcileWalletUseCase;

	beforeEach(() => {
		walletRepository = new WalletMemoryRepository();
		ledgerRepository = new WalletLedgerEntryMemoryRepository();
		useCase = new ReconcileWalletUseCase(walletRepository, ledgerRepository);
	});

	it('should throw WalletNotFoundError when wallet does not exist', async () => {
		expect(useCase.execute({ walletId: 'non-existing-wallet-id' })).rejects.toBeInstanceOf(WalletNotFoundError);
	});

	it('should return consistent=true for a zero-balance wallet without entries', async () => {
		const wallet = Wallet.open({
			id: 'wallet-1',
			playerId: 'player-1',
			initialBalance: Money.zero('BRL')
		});
		await walletRepository.create(wallet);

		const result = await useCase.execute({ walletId: 'wallet-1' });

		expect(result).toEqual({
			walletId: 'wallet-1',
			storedBalance: { amount: '0.00', currency: 'BRL' },
			calculatedBalance: { amount: '0.00', currency: 'BRL' },
			difference: { amount: '0.00', currency: 'BRL' },
			consistent: true,
			checkedEntries: 0
		});
	});

	it('should return consistent=true when stored balance matches ledger entries sum', async () => {
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
			balanceAfter: Money.from({ amount: '100.00', currency: 'BRL' })
		});

		const entry2 = wallet.debit(Money.from({ amount: '25.00', currency: 'BRL' }), 'tx-2');
		await walletRepository.update(wallet);

		await ledgerRepository.create(entry1);
		await ledgerRepository.create(entry2);

		const result = await useCase.execute({ walletId: 'wallet-1' });

		expect(result.consistent).toBe(true);
		expect(result.storedBalance).toEqual({ amount: '75.00', currency: 'BRL' });
		expect(result.calculatedBalance).toEqual({ amount: '75.00', currency: 'BRL' });
		expect(result.difference).toEqual({ amount: '0.00', currency: 'BRL' });
		expect(result.checkedEntries).toBe(2);
	});

	it('should return consistent=false when stored balance diverges from ledger calculation and log warning', async () => {
		const warnSpy = spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

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
			money: Money.from({ amount: '50.00', currency: 'BRL' }),
			balanceBefore: Money.zero('BRL'),
			balanceAfter: Money.from({ amount: '50.00', currency: 'BRL' })
		});
		await ledgerRepository.create(entry1);

		const result = await useCase.execute({ walletId: 'wallet-1' });

		expect(result.consistent).toBe(false);
		expect(result.storedBalance).toEqual({ amount: '100.00', currency: 'BRL' });
		expect(result.calculatedBalance).toEqual({ amount: '50.00', currency: 'BRL' });
		expect(result.difference).toEqual({ amount: '50.00', currency: 'BRL' });
		expect(result.checkedEntries).toBe(1);
		expect(warnSpy).toHaveBeenCalledWith('Wallet reconciliation discrepancy detected', expect.objectContaining({ walletId: 'wallet-1' }));

		warnSpy.mockRestore();
	});
});
