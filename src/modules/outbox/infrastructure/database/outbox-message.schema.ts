import { EntitySchema } from '@mikro-orm/core';

export interface OutboxMessageDbRecord {
	id: string;
	aggregateId: string;
	eventType: string;
	payload: Record<string, unknown>;
	occurredAt: Date;
	attempts: number;
	nextAttemptAt?: Date;
	publishedAt?: Date;
}

export const OutboxMessageSchema = new EntitySchema<OutboxMessageDbRecord>({
	name: 'OutboxMessage',
	tableName: 'outbox_messages',
	properties: {
		id: { primary: true, type: 'uuid' },
		aggregateId: { type: 'varchar(255)', index: true },
		eventType: { type: 'varchar(100)' },
		payload: { type: 'json' },
		occurredAt: { type: 'Date', defaultRaw: 'CURRENT_TIMESTAMP' },
		attempts: { type: 'integer', default: 0 },
		nextAttemptAt: { type: 'Date', nullable: true },
		publishedAt: { type: 'Date', nullable: true }
	},
	indexes: [{ properties: ['publishedAt', 'nextAttemptAt'] }]
});
