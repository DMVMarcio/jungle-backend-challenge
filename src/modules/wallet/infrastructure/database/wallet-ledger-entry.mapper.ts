import { WalletLedgerEntry } from '@/modules/wallet/domain/wallet-ledger-entry';

import { Money } from '@/shared/domain/money/money';

import { WalletLedgerEntryDbRecord } from './wallet-ledger-entry.schema';

export class WalletLedgerEntryMapper {
	static toDomain(record: WalletLedgerEntryDbRecord): WalletLedgerEntry {
		return WalletLedgerEntry.rehydrate({
			id: record.id,
			walletId: record.walletId,
			transactionId: record.transactionId,
			direction: record.direction,
			money: Money.from({ amount: record.amount, currency: record.currency }),
			balanceBefore: Money.from({ amount: record.balanceBefore, currency: record.currency }),
			balanceAfter: Money.from({ amount: record.balanceAfter, currency: record.currency }),
			createdAt: record.createdAt
		});
	}

	static toPersistence(domain: WalletLedgerEntry): WalletLedgerEntryDbRecord {
		return {
			id: domain.id,
			walletId: domain.walletId,
			transactionId: domain.transactionId,
			direction: domain.direction,
			amount: domain.money.toJSON().amount,
			balanceBefore: domain.balanceBefore.toJSON().amount,
			balanceAfter: domain.balanceAfter.toJSON().amount,
			currency: domain.money.currency,
			createdAt: domain.createdAt
		};
	}
}
