import { Injectable } from '@nestjs/common';

import { WalletLedgerEntry } from '../../domain/wallet-ledger-entry';
import {
	FindLedgerEntriesInput,
	IWalletLedgerEntryRepository,
	PaginatedLedgerEntries
} from '../../domain/wallet-ledger-entry.repository.interface';

@Injectable()
export class WalletLedgerEntryMemoryRepository implements IWalletLedgerEntryRepository {
	readonly items: WalletLedgerEntry[] = [];

	async findPaginated(input: FindLedgerEntriesInput): Promise<PaginatedLedgerEntries> {
		const limit = Math.min(Math.max(input.limit || 50, 1), 100);

		let entries = this.items
			.filter(e => e.walletId === input.walletId)
			.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));

		if (input.cursor) {
			try {
				const decoded = JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8'));
				const cursorTime = new Date(decoded.createdAt).getTime();

				entries = entries.filter(e => {
					const time = e.createdAt.getTime();
					return time < cursorTime || (time === cursorTime && e.id.localeCompare(decoded.id) < 0);
				});
			} catch {}
		}

		const hasMore = entries.length > limit;
		const pageEntries = hasMore ? entries.slice(0, limit) : entries;

		let nextCursor: string | null = null;
		if (hasMore && pageEntries.length > 0) {
			const last = pageEntries[pageEntries.length - 1];

			nextCursor = Buffer.from(JSON.stringify({ createdAt: last.createdAt.toISOString(), id: last.id })).toString(
				'base64url'
			);
		}

		return {
			items: pageEntries,
			nextCursor
		};
	}

	async findAllByWalletId(walletId: string): Promise<WalletLedgerEntry[]> {
		return this.items
			.filter(e => e.walletId === walletId)
			.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
	}

	async findByTransactionId(transactionId: string): Promise<WalletLedgerEntry | null> {
		return this.items.find(e => e.transactionId === transactionId) ?? null;
	}

	async create(entry: WalletLedgerEntry): Promise<void> {
		this.items.push(entry);
	}
}
