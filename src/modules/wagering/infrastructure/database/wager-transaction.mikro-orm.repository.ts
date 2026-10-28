import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';

import {
	WagerTransaction,
	WagerTransactionKind,
	WagerTransactionStatus
} from '@/modules/wagering/domain/wager-transaction';
import { IWagerTransactionRepository } from '@/modules/wagering/domain/wager-transaction.repository.interface';

import { WagerTransactionMapper } from './wager-transaction.mapper';
import { WagerTransactionSchema } from './wager-transaction.schema';

@Injectable()
export class WagerTransactionMikroOrmRepository implements IWagerTransactionRepository {
	constructor(private readonly entityManager: EntityManager) {}

	async findById(id: string): Promise<WagerTransaction | null> {
		const record = await this.entityManager.findOne(WagerTransactionSchema, { id });
		if (!record) return null;

		return WagerTransactionMapper.toDomain(record);
	}

	async findByIdempotencyKey(idempotencyKey: string): Promise<WagerTransaction | null> {
		const record = await this.entityManager.findOne(WagerTransactionSchema, { idempotencyKey });
		if (!record) return null;

		return WagerTransactionMapper.toDomain(record);
	}

	async findByProviderAndExternalId(
		providerId: string,
		externalTransactionId: string
	): Promise<WagerTransaction | null> {
		const record = await this.entityManager.findOne(WagerTransactionSchema, {
			providerId,
			externalTransactionId
		});
		if (!record) return null;

		return WagerTransactionMapper.toDomain(record);
	}

	async findProcessedByReferenceId(
		referenceTransactionId: string,
		kind?: WagerTransactionKind
	): Promise<WagerTransaction | null> {
		const record = await this.entityManager.findOne(WagerTransactionSchema, {
			referenceTransactionId,
			status: WagerTransactionStatus.Processed,
			kind: kind ?? { $in: [WagerTransactionKind.Refund, WagerTransactionKind.Rollback] }
		});
		if (!record) return null;

		return WagerTransactionMapper.toDomain(record);
	}

	async findPendingReferences(limit = 50): Promise<WagerTransaction[]> {
		const records = await this.entityManager.find(
			WagerTransactionSchema,
			{ status: WagerTransactionStatus.PendingReference },
			{ limit, orderBy: { createdAt: 'ASC' } }
		);

		return records.map(record => WagerTransactionMapper.toDomain(record));
	}

	async create(transaction: WagerTransaction): Promise<void> {
		const record = this.entityManager.create(
			WagerTransactionSchema,
			WagerTransactionMapper.toPersistence(transaction)
		);

		this.entityManager.persist(record);
		await this.entityManager.flush();
	}

	async update(transaction: WagerTransaction): Promise<void> {
		const persistenceData = WagerTransactionMapper.toPersistence(transaction);
		const record = await this.entityManager.findOne(WagerTransactionSchema, {
			id: transaction.id
		});

		if (record) this.entityManager.assign(record, persistenceData);

		await this.entityManager.flush();
	}
}
