import { describe, expect, it } from 'bun:test';

import { Money } from './money';

describe('Money Value Object', () => {
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
