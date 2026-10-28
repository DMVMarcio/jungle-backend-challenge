import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';

import { InboxMessage } from '@/modules/inbox/domain/inbox-message';
import { IInboxRepository } from '@/modules/inbox/domain/inbox.repository.interface';

import { InboxMessageMapper } from './inbox-message.mapper';
import { InboxMessageSchema } from './inbox-message.schema';

@Injectable()
export class InboxMikroOrmRepository implements IInboxRepository {
	constructor(private readonly entityManager: EntityManager) {}

	async findByMessageIdAndConsumer(messageId: string, consumerName: string): Promise<InboxMessage | null> {
		const record = await this.entityManager.findOne(InboxMessageSchema, { messageId, consumerName });
		if (!record) return null;

		return InboxMessageMapper.toDomain(record);
	}

	async create(message: InboxMessage): Promise<void> {
		const record = this.entityManager.create(InboxMessageSchema, InboxMessageMapper.toPersistence(message));
		this.entityManager.persist(record);

		await this.entityManager.flush();
	}

	async update(message: InboxMessage): Promise<void> {
		const record = await this.entityManager.findOne(InboxMessageSchema, {
			messageId: message.messageId,
			consumerName: message.consumerName
		});
		if (!record) return;

		this.entityManager.assign(record, InboxMessageMapper.toPersistence(message));
		await this.entityManager.flush();
	}
}
