import { EntitySchema } from '@mikro-orm/core';

import { MoneyAmountType } from '@/core/database/types/money-amount.type';

import { FailureCode, WagerTransactionKind, WagerTransactionStatus } from '@/modules/wagering/domain/wager-transaction';

export interface WagerTransactionDbRecord {
	id: string;
	providerId: string;
	externalTransactionId: string;
	idempotencyKey: string;
	payloadHash: string;
	walletId: string;
	playerId: string;
	roundId: string;
	gameId: string;
	kind: WagerTransactionKind;
	amount: string;
	currency: string;
	referenceExternalTransactionId?: string;
	referenceTransactionId?: string;
	status: WagerTransactionStatus;
	failureCode?: FailureCode;
	createdAt: Date;
	processedAt?: Date;
}

export const WagerTransactionSchema = new EntitySchema<WagerTransactionDbRecord>({
	name: 'WagerTransaction',
	tableName: 'wager_transactions',
	properties: {
		id: { primary: true, type: 'uuid' },
		providerId: { type: 'varchar(100)' },
		externalTransactionId: { type: 'varchar(255)' },
		idempotencyKey: { type: 'varchar(255)', unique: true },
		payloadHash: { type: 'varchar(64)' },
		walletId: { type: 'uuid', index: true },
		playerId: { type: 'uuid', index: true },
		roundId: { type: 'varchar(100)' },
		gameId: { type: 'varchar(100)' },
		kind: { enum: true, items: () => WagerTransactionKind },
		amount: { type: MoneyAmountType },
		currency: { type: 'varchar(3)' },
		referenceExternalTransactionId: { type: 'varchar(255)', nullable: true },
		referenceTransactionId: { type: 'uuid', nullable: true },
		status: { enum: true, items: () => WagerTransactionStatus, index: true },
		failureCode: { type: 'varchar(50)', nullable: true },
		createdAt: { type: 'Date', defaultRaw: 'CURRENT_TIMESTAMP' },
		processedAt: { type: 'Date', nullable: true }
	},
	uniques: [{ properties: ['providerId', 'externalTransactionId'] }],
	indexes: [{ properties: ['providerId', 'referenceExternalTransactionId'] }, { properties: ['walletId', 'roundId'] }]
});
