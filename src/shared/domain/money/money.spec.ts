import { describe, expect, it } from 'bun:test';

import { Money } from './money';

describe('Money Value Object', () => {
	describe('Comparisons', () => {
		it('should evaluate isLessThan correctly', () => {
			const tenMoney = Money.from({ amount: '10.00', currency: 'BRL' });
			const twentyMoney = Money.from({ amount: '20.00', currency: 'BRL' });
			const equalTenMoney = Money.from({ amount: '10.00', currency: 'BRL' });

			expect(tenMoney.isLessThan(twentyMoney)).toBe(true);
			expect(twentyMoney.isLessThan(tenMoney)).toBe(false);
			expect(tenMoney.isLessThan(equalTenMoney)).toBe(false);
		});

		it('should evaluate equals() correctly across amounts and currencies', () => {
			const firstMoney = Money.from({ amount: '50.00', currency: 'BRL' });
			const sameFirstMoney = Money.from({ amount: '50.00', currency: 'BRL' });

			const differentAmount = Money.from({ amount: '50.01', currency: 'BRL' });
			const differentCurrency = Money.from({ amount: '50.00', currency: 'USD' });

			expect(firstMoney.equals(sameFirstMoney)).toBe(true);

			expect(firstMoney.equals(differentAmount)).toBe(false);
			expect(firstMoney.equals(differentCurrency)).toBe(false);
		});
	});

	describe('Serialization', () => {
		it('should serialize to JSON with 2 fixed decimal places', () => {
			const money = Money.from({ amount: '100.5', currency: 'BRL' });

			expect(money.toJSON()).toEqual({
				amount: '100.50',
				currency: 'BRL'
			});
		});

		it('should serialize to string formatted with currency', () => {
			const money = Money.from({ amount: '100.50', currency: 'BRL' });

			expect(money.toString()).toBe('100.50 BRL');
		});
	});
});
