import { describe, expect, it } from 'bun:test';

import { Money } from './money';

describe('Money Value Object', () => {
	describe('Arithmetic', () => {
		it('should add amounts correctly without floating-point errors', () => {
			const firstMoney = Money.from({ amount: '0.10', currency: 'BRL' });
			const secondMoney = Money.from({ amount: '0.20', currency: 'BRL' });

			const result = firstMoney.add(secondMoney);

			expect(result.toJSON().amount).toBe('0.30');
		});

		it('should subtract amounts correctly without floating-point errors', () => {
			const firstMoney = Money.from({ amount: '0.30', currency: 'BRL' });
			const secondMoney = Money.from({ amount: '0.20', currency: 'BRL' });

			const result = firstMoney.subtract(secondMoney);

			expect(result.toJSON().amount).toBe('0.10');
		});

		it('should negate amount correctly', () => {
			const money = Money.from({ amount: '50.00', currency: 'BRL' });
			const negatedMoney = money.negate();

			expect(negatedMoney.toJSON().amount).toBe('-50.00');
		});

		it('should guarantee immutability by not modifying original instances', () => {
			const originalMoney = Money.from({ amount: '50.00', currency: 'BRL' });
			const otherMoney = Money.from({ amount: '10.00', currency: 'BRL' });

			const result = originalMoney.add(otherMoney);

			expect(originalMoney.toJSON().amount).toBe('50.00');
			expect(result).not.toBe(originalMoney);
		});
	});

	describe('State', () => {
		it('should correctly determine isZero()', () => {
			const zeroMoney = Money.from({ amount: '0.00', currency: 'BRL' });

			const positiveMoney = Money.from({ amount: '10.0', currency: 'BRL' });
			const negativeMoney = positiveMoney.negate();

			expect(zeroMoney.isZero()).toBe(true);
			expect(positiveMoney.isZero()).toBe(false);
			expect(negativeMoney.isZero()).toBe(false);
		});

		it('should correctly determine isPositive()', () => {
			const zeroMoney = Money.zero('BRL');

			const positiveMoney = Money.from({ amount: '10.0', currency: 'BRL' });
			const negativeMoney = positiveMoney.negate();

			expect(positiveMoney.isPositive()).toBe(true);
			expect(zeroMoney.isPositive()).toBe(false);
			expect(negativeMoney.isPositive()).toBe(false);
		});

		it('should correctly determine isNegative()', () => {
			const zeroMoney = Money.zero('BRL');

			const positiveMoney = Money.from({ amount: '10.0', currency: 'BRL' });
			const negativeMoney = positiveMoney.negate();

			expect(negativeMoney.isNegative()).toBe(true);
			expect(zeroMoney.isNegative()).toBe(false);
			expect(positiveMoney.isNegative()).toBe(false);
		});
	});

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
