import { Injectable } from '@nestjs/common';

import {
	WagerTransaction,
	WagerTransactionKind,
	WagerTransactionStatus
} from '@/modules/wagering/domain/wager-transaction';
import { IWagerTransactionRepository } from '@/modules/wagering/domain/wager-transaction.repository.interface';

@Injectable()
export class WagerTransactionMemoryRepository implements IWagerTransactionRepository {
	readonly items: WagerTransaction[] = [];

	async findById(id: string): Promise<WagerTransaction | null> {
		return this.items.find(item => item.id === id) ?? null;
	}

	async findByIdempotencyKey(key: string): Promise<WagerTransaction | null> {
		return this.items.find(item => item.idempotencyKey === key) ?? null;
	}

	async findByProviderAndExternalId(
		providerId: string,
		externalTransactionId: string
	): Promise<WagerTransaction | null> {
		return (
			this.items.find(
				item => item.providerId === providerId && item.externalTransactionId === externalTransactionId
			) ?? null
		);
	}

	async findProcessedByReferenceId(
		referenceTransactionId: string,
		kind?: WagerTransactionKind
	): Promise<WagerTransaction | null> {
		return (
			this.items.find(
				item =>
					item.referenceTransactionId === referenceTransactionId &&
					item.status === WagerTransactionStatus.Processed &&
					(!kind || item.kind === kind)
			) ?? null
		);
	}

	async findPendingReferences(limit = 50): Promise<WagerTransaction[]> {
		return this.items.filter(item => item.status === WagerTransactionStatus.PendingReference).slice(0, limit);
	}

	async create(transaction: WagerTransaction): Promise<void> {
		this.items.push(transaction);
	}

	async update(transaction: WagerTransaction): Promise<void> {
		const index = this.items.findIndex(item => item.id === transaction.id);

		if (index >= 0) this.items[index] = transaction;
	}
}
