import { OutboxMessage } from '@/modules/outbox/domain/outbox-message';

import { OutboxMessageDbRecord } from './outbox-message.schema';

export class OutboxMessageMapper {
	static toDomain(record: OutboxMessageDbRecord): OutboxMessage {
		return OutboxMessage.rehydrate({
			id: record.id,
			aggregateId: record.aggregateId,
			eventType: record.eventType,
			payload: record.payload,
			occurredAt: record.occurredAt,
			attempts: record.attempts,
			nextAttemptAt: record.nextAttemptAt,
			publishedAt: record.publishedAt
		});
	}

	static toPersistence(domain: OutboxMessage): OutboxMessageDbRecord {
		return {
			id: domain.id,
			aggregateId: domain.aggregateId,
			eventType: domain.eventType,
			payload: { ...domain.payload },
			occurredAt: domain.occurredAt,
			attempts: domain.attempts,
			nextAttemptAt: domain.nextAttemptAt,
			publishedAt: domain.publishedAt
		};
	}
}
