import { Type } from '@mikro-orm/core';

export class MoneyAmountType extends Type<string, string> {
	getColumnType(): string {
		return 'numeric(18, 2)';
	}

	convertToDatabaseValue(value?: string): string {
		return value ?? '0.00';
	}

	convertToJSValue(value?: string): string {
		return value ?? '0.00';
	}
}
