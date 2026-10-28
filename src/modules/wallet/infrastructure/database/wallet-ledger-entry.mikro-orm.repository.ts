import type { FilterQuery } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';

import { WalletLedgerEntry } from '@/modules/wallet/domain/wallet-ledger-entry';
import {
	FindLedgerEntriesInput,
	IWalletLedgerEntryRepository,
	PaginatedLedgerEntries
} from '@/modules/wallet/domain/wallet-ledger-entry.repository.interface';

import { WalletLedgerEntryMapper } from './wallet-ledger-entry.mapper';
import { WalletLedgerEntryDbRecord, WalletLedgerEntrySchema } from './wallet-ledger-entry.schema';

@Injectable()
export class WalletLedgerEntryMikroOrmRepository implements IWalletLedgerEntryRepository {
	constructor(private readonly entityManager: EntityManager) {}

	async findPaginated(input: FindLedgerEntriesInput): Promise<PaginatedLedgerEntries> {
		const limit = Math.min(Math.max(input.limit || 50, 1), 100);
		const whereClause: FilterQuery<WalletLedgerEntryDbRecord> = { walletId: input.walletId };

		if (input.cursor) {
			try {
				const decoded = JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8'));
				const cursorDate = new Date(decoded.createdAt);

				whereClause.$or = [
					{ createdAt: { $lt: cursorDate } },
					{ createdAt: cursorDate, id: { $lt: decoded.id } }
				];
			} catch {}
		}

		const records = await this.entityManager.find(WalletLedgerEntrySchema, whereClause, {
			limit: limit + 1,
			orderBy: { createdAt: 'DESC', id: 'DESC' }
		});

		const hasMore = records.length > limit;
		const pageRecords = hasMore ? records.slice(0, limit) : records;

		let nextCursor: string | null = null;
		if (hasMore && pageRecords.length > 0) {
			const lastRecord = pageRecords[pageRecords.length - 1];

			nextCursor = Buffer.from(
				JSON.stringify({ createdAt: lastRecord.createdAt.toISOString(), id: lastRecord.id })
			).toString('base64url');
		}

		return {
			items: pageRecords.map(r => WalletLedgerEntryMapper.toDomain(r)),
			nextCursor
		};
	}

	async findAllByWalletId(walletId: string): Promise<WalletLedgerEntry[]> {
		const records = await this.entityManager.find(
			WalletLedgerEntrySchema,
			{ walletId },
			{ orderBy: { createdAt: 'ASC', id: 'ASC' } }
		);

		return records.map(r => WalletLedgerEntryMapper.toDomain(r));
	}

	async findByTransactionId(transactionId: string): Promise<WalletLedgerEntry | null> {
		const record = await this.entityManager.findOne(WalletLedgerEntrySchema, { transactionId });
		if (!record) return null;

		return WalletLedgerEntryMapper.toDomain(record);
	}

	async create(entry: WalletLedgerEntry): Promise<void> {
		const record = this.entityManager.create(WalletLedgerEntrySchema, WalletLedgerEntryMapper.toPersistence(entry));
		this.entityManager.persist(record);

		await this.entityManager.flush();
	}
}
