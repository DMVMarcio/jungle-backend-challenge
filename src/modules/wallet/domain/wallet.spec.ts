import { describe, expect, it } from 'bun:test';

import { Money } from '@/shared/domain/money/money';

import { Wallet } from './wallet';
import { InvalidInitialBalanceError } from './wallet.errors';

describe('Wallet Aggregate Root & Ledger', () => {
	const playerId = 'player-123';

	describe('Wallet open', () => {
		it('should open a wallet with initial balance and version 1', () => {
			const initialBalanceMoney = Money.from({ amount: '100.00', currency: 'BRL' });
			const wallet = Wallet.open({ playerId, initialBalance: initialBalanceMoney });

			expect(wallet.playerId).toBe(playerId);

			expect(wallet.currency).toBe('BRL');
			expect(wallet.balance.toJSON().amount).toBe('100.00');

			expect(wallet.version).toBe(1);
			expect(wallet.id).toBeDefined();
		});

		it('should reject opening a wallet with negative balance', () => {
			const negativeBalanceMoney = Money.from({ amount: '50.00', currency: 'BRL' }).negate();

			expect(() => Wallet.open({ playerId, initialBalance: negativeBalanceMoney })).toThrow(
				InvalidInitialBalanceError
			);
		});
	});
});
