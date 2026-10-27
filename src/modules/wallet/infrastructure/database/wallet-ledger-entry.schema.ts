import { EntitySchema } from '@mikro-orm/core';

import { MoneyAmountType } from '@/core/database/types/money-amount.type';

import { LedgerDirection } from '@/modules/wallet/domain/wallet-ledger-entry';

export interface WalletLedgerEntryDbRecord {
	id: string;
	walletId: string;
	transactionId: string;
	direction: LedgerDirection;
	amount: string;
	balanceBefore: string;
	balanceAfter: string;
	currency: string;
	createdAt: Date;
}

export const WalletLedgerEntrySchema = new EntitySchema<WalletLedgerEntryDbRecord>({
	name: 'WalletLedgerEntry',
	tableName: 'wallet_ledger_entries',
	properties: {
		id: { primary: true, type: 'uuid' },
		walletId: { type: 'uuid', index: true },
		transactionId: { type: 'varchar(255)', index: true },
		direction: { enum: true, items: () => LedgerDirection },
		amount: { type: MoneyAmountType },
		balanceBefore: { type: MoneyAmountType },
		balanceAfter: { type: MoneyAmountType },
		currency: { type: 'varchar(3)' },
		createdAt: { type: 'Date', defaultRaw: 'CURRENT_TIMESTAMP', index: true }
	},
	indexes: [{ properties: ['walletId', 'createdAt'] }]
});
