import { Wallet } from '@/modules/wallet/domain/wallet';

import { Money } from '@/shared/domain/money/money';

import { WalletDbRecord } from './wallet.schema';

export class WalletMapper {
	static toDomain(record: WalletDbRecord): Wallet {
		return Wallet.rehydrate({
			id: record.id,
			playerId: record.playerId,
			currency: record.currency,
			balance: Money.from({ amount: record.balanceAmount, currency: record.currency }),
			version: record.version,
			createdAt: record.createdAt,
			updatedAt: record.updatedAt
		});
	}

	static toPersistence(domain: Wallet): WalletDbRecord {
		return {
			id: domain.id,
			playerId: domain.playerId,
			balanceAmount: domain.balance.toJSON().amount,
			currency: domain.currency,
			version: domain.version,
			createdAt: domain.createdAt,
			updatedAt: domain.updatedAt
		};
	}
}
