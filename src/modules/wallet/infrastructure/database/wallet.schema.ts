import { EntitySchema } from '@mikro-orm/core';

import { MoneyAmountType } from '@/core/database/types/money-amount.type';

export interface WalletDbRecord {
	id: string;
	playerId: string;
	balanceAmount: string;
	currency: string;
	version: number;
	createdAt: Date;
	updatedAt: Date;
}

export const WalletSchema = new EntitySchema<WalletDbRecord>({
	name: 'Wallet',
	tableName: 'wallets',
	properties: {
		id: { primary: true, type: 'uuid' },
		playerId: { type: 'uuid' },
		balanceAmount: {
			type: MoneyAmountType,
			check: 'balance_amount >= 0'
		},
		currency: { type: 'varchar(3)' },
		version: { type: 'integer', version: true },
		createdAt: { type: 'Date', defaultRaw: 'CURRENT_TIMESTAMP' },
		updatedAt: { type: 'Date', defaultRaw: 'CURRENT_TIMESTAMP' }
	},
	uniques: [{ properties: ['playerId', 'currency'] }]
});
