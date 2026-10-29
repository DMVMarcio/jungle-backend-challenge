import Decimal from 'decimal.js';

import { CurrencyMismatchError, InvalidMoneyError } from './money.errors';

export interface MoneyProps {
	amount: string;
	currency: string;
}

export class Money {
	private static readonly AMOUNT_REGEX = /^\d+\.\d{2}$/;
	private static readonly CURRENCY_REGEX = /^[A-Z]{3}$/;

	private constructor(
		private readonly value: Decimal,
		public readonly currency: string
	) {}

	static from(props: MoneyProps): Money {
		const currency = this.normalizeCurrency(props?.currency);
		const amount = props?.amount?.trim();

		if (!amount || !this.AMOUNT_REGEX.test(amount))
			throw new InvalidMoneyError(
				`Amount '${props?.amount}' must be a decimal string with 2 fixed decimal places`
			);

		return new Money(new Decimal(amount), currency);
	}

	static zero(currency: string): Money {
		return new Money(new Decimal(0), this.normalizeCurrency(currency));
	}

	private static normalizeCurrency(currency: string): string {
		const normalized = currency?.trim().toUpperCase();
		if (!normalized || !this.CURRENCY_REGEX.test(normalized))
			throw new InvalidMoneyError(`Currency '${currency}' must be a 3-letter ISO-4217 code`);

		return normalized;
	}

	add(other: Money): Money {
		this.assertSameCurrency(other);

		return new Money(this.value.plus(other.value), this.currency);
	}

	subtract(other: Money): Money {
		this.assertSameCurrency(other);

		return new Money(this.value.minus(other.value), this.currency);
	}

	negate(): Money {
		return new Money(this.value.negated(), this.currency);
	}

	isZero(): boolean {
		return this.value.isZero();
	}

	isPositive(): boolean {
		return this.value.greaterThan(0);
	}

	isNegative(): boolean {
		return this.value.lessThan(0);
	}

	isLessThan(other: Money): boolean {
		this.assertSameCurrency(other);

		return this.value.lessThan(other.value);
	}

	equals(other: Money): boolean {
		return this.currency === other.currency && this.value.equals(other.value);
	}

	toJSON(): MoneyProps {
		return {
			amount: this.value.toFixed(2),
			currency: this.currency
		};
	}

	toString(): string {
		return `${this.value.toFixed(2)} ${this.currency}`;
	}

	private assertSameCurrency(other: Money): void {
		if (this.currency !== other.currency) throw new CurrencyMismatchError(this.currency, other.currency);
	}
}
