import { BusinessRuleError, ValidationError } from '../errors';

export class InvalidMoneyError extends ValidationError {
	readonly code = 'INVALID_MONEY';

	constructor(reason: string) {
		super(`Invalid money: ${reason}`);
	}
}

export class CurrencyMismatchError extends BusinessRuleError {
	readonly code = 'CURRENCY_MISMATCH';

	constructor(expected: string, received: string) {
		super(`Currency mismatch: expected '${expected}', but received '${received}'`);
	}
}
