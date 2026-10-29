import { EntityManager, LockMode } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';

import { OutboxMessage } from '@/modules/outbox/domain/outbox-message';
import { IOutboxRepository } from '@/modules/outbox/domain/outbox.repository.interface';

import { OutboxMessageMapper } from './outbox-message.mapper';
import { OutboxMessageSchema } from './outbox-message.schema';

@Injectable()
export class OutboxMikroOrmRepository implements IOutboxRepository {
	constructor(private readonly entityManager: EntityManager) {}

	async findPendingDue(limit = 50, now: Date = new Date()): Promise<OutboxMessage[]> {
		const records = await this.entityManager.find(
			OutboxMessageSchema,
			{
				publishedAt: null,
				attempts: { $lt: OutboxMessage.MAX_ATTEMPTS },
				$or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }]
			},
			{
				limit,
				orderBy: { occurredAt: 'ASC', id: 'ASC' },
				lockMode: LockMode.PESSIMISTIC_PARTIAL_WRITE
			}
		);

		return records.map(r => OutboxMessageMapper.toDomain(r));
	}

	async countPending(): Promise<number> {
		return this.entityManager.count(OutboxMessageSchema, { publishedAt: null });
	}

	async create(message: OutboxMessage): Promise<void> {
		const record = this.entityManager.create(OutboxMessageSchema, OutboxMessageMapper.toPersistence(message));
		this.entityManager.persist(record);

		await this.entityManager.flush();
	}

	async update(message: OutboxMessage): Promise<void> {
		const persistenceData = OutboxMessageMapper.toPersistence(message);
		const record = await this.entityManager.findOne(OutboxMessageSchema, { id: message.id });

		if (record) this.entityManager.assign(record, persistenceData);

		await this.entityManager.flush();
	}

	async updateMany(messages: OutboxMessage[]): Promise<void> {
		if (messages.length === 0) return;

		const ids = messages.map(m => m.id);
		const records = await this.entityManager.find(OutboxMessageSchema, { id: { $in: ids } });
		const recordMap = new Map(records.map(r => [r.id, r]));

		for (const message of messages) {
			const record = recordMap.get(message.id);
			if (record) {
				this.entityManager.assign(record, OutboxMessageMapper.toPersistence(message));
			}
		}

		await this.entityManager.flush();
	}
}
