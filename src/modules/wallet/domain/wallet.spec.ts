import { describe, expect, it } from 'bun:test';

import { Money } from '@/shared/domain/money/money';
import { CurrencyMismatchError } from '@/shared/domain/money/money.errors';

import { Wallet } from './wallet';
import { LedgerDirection, WalletLedgerEntry } from './wallet-ledger-entry';
import { InsufficientFundsError, InvalidInitialBalanceError, UnbalancedLedgerEntryError } from './wallet.errors';

describe('Wallet Aggregate Root & Ledger', () => {
	const playerId = 'player-123';

	describe('Open', () => {
		it('should open a wallet with initial balance and version 1', () => {
			const initialBalance = Money.from({ amount: '100.00', currency: 'BRL' });
			const wallet = Wallet.open({ playerId, initialBalance: initialBalance });

			expect(wallet.playerId).toBe(playerId);

			expect(wallet.currency).toBe('BRL');
			expect(wallet.balance.toJSON().amount).toBe('100.00');

			expect(wallet.version).toBe(1);
			expect(wallet.id).toBeDefined();
		});

		it('should reject opening a wallet with negative balance', () => {
			const negativeBalance = Money.from({ amount: '50.00', currency: 'BRL' }).negate();

			expect(() => Wallet.open({ playerId, initialBalance: negativeBalance })).toThrow(
				InvalidInitialBalanceError
			);
		});
	});

	describe('Credit', () => {
		it('should increase balance, increment version, and produce a balanced credit ledger entry', () => {
			const wallet = Wallet.open({
				playerId,
				initialBalance: Money.from({ amount: '50.00', currency: 'BRL' })
			});

			const transactionId = 'tx-credit-1';

			const creditAmount = Money.from({ amount: '25.00', currency: 'BRL' });
			const ledgerEntry = wallet.credit(creditAmount, transactionId);

			expect(wallet.balance.toJSON().amount).toBe('75.00');
			expect(wallet.version).toBe(2);

			expect(ledgerEntry.walletId).toBe(wallet.id);
			expect(ledgerEntry.transactionId).toBe(transactionId);
			expect(ledgerEntry.direction).toBe(LedgerDirection.Credit);
			expect(ledgerEntry.money.toJSON().amount).toBe('25.00');
			expect(ledgerEntry.balanceBefore.toJSON().amount).toBe('50.00');
			expect(ledgerEntry.balanceAfter.toJSON().amount).toBe('75.00');
			expect(ledgerEntry.isBalanced()).toBe(true);
		});
	});

	describe('Debit', () => {
		it('should decrease balance, increment version, and produce a balanced debit ledger entry', () => {
			const wallet = Wallet.open({
				playerId,
				initialBalance: Money.from({ amount: '100.00', currency: 'BRL' })
			});

			const transactionId = 'tx-debit-1';

			const debitAmount = Money.from({ amount: '40.00', currency: 'BRL' });
			const ledgerEntry = wallet.debit(debitAmount, transactionId);

			expect(wallet.balance.toJSON().amount).toBe('60.00');
			expect(wallet.version).toBe(2);

			expect(ledgerEntry.direction).toBe(LedgerDirection.Debit);
			expect(ledgerEntry.balanceBefore.toJSON().amount).toBe('100.00');
			expect(ledgerEntry.balanceAfter.toJSON().amount).toBe('60.00');
			expect(ledgerEntry.isBalanced()).toBe(true);
		});

		it('should throw InsufficientFundsError and keep balance and version untouched when balance is insufficient', () => {
			const wallet = Wallet.open({
				playerId,
				initialBalance: Money.from({ amount: '50.00', currency: 'BRL' })
			});

			const excessiveAmount = Money.from({ amount: '50.01', currency: 'BRL' });

			expect(() => wallet.debit(excessiveAmount, 'tx-fail')).toThrow(InsufficientFundsError);

			expect(wallet.balance.toJSON().amount).toBe('50.00');
			expect(wallet.version).toBe(1);
		});
	});

	describe('Currency Guards', () => {
		it('should throw CurrencyMismatchError when trying to credit a different currency', () => {
			const wallet = Wallet.open({
				playerId,
				initialBalance: Money.from({ amount: '100.00', currency: 'BRL' })
			});

			const usdMoney = Money.from({ amount: '10.00', currency: 'USD' });

			expect(() => wallet.credit(usdMoney, 'tx-cross-currency')).toThrow(CurrencyMismatchError);
			expect(wallet.balance.toJSON().amount).toBe('100.00');
		});

		it('should throw CurrencyMismatchError when trying to debit a different currency', () => {
			const wallet = Wallet.open({
				playerId,
				initialBalance: Money.from({ amount: '100.00', currency: 'BRL' })
			});

			const usdMoney = Money.from({ amount: '10.00', currency: 'USD' });

			expect(() => wallet.debit(usdMoney, 'tx-cross-currency')).toThrow(CurrencyMismatchError);
		});
	});

	describe('WalletLedgerEntry Integrity', () => {
		it('should reject creation of unbalanced ledger entries', () => {
			expect(() =>
				WalletLedgerEntry.create({
					walletId: 'w-1',
					transactionId: 'tx-unbalanced',
					direction: LedgerDirection.Credit,
					money: Money.from({ amount: '20.00', currency: 'BRL' }),
					balanceBefore: Money.from({ amount: '100.00', currency: 'BRL' }),
					balanceAfter: Money.from({ amount: '150.00', currency: 'BRL' })
				})
			).toThrow(UnbalancedLedgerEntryError);
		});
	});
});
