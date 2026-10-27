import { EntitySchema } from '@mikro-orm/core';

export interface InboxMessageDbRecord {
	messageId: string;
	consumerName: string;
	payloadHash: string;
	receivedAt: Date;
	processedAt?: Date;
}

export const InboxMessageSchema = new EntitySchema<InboxMessageDbRecord>({
	name: 'InboxMessage',
	tableName: 'inbox_messages',
	properties: {
		messageId: { primary: true, type: 'varchar(255)' },
		consumerName: { primary: true, type: 'varchar(100)' },
		payloadHash: { type: 'varchar(64)' },
		receivedAt: { type: 'Date', defaultRaw: 'CURRENT_TIMESTAMP' },
		processedAt: { type: 'Date', nullable: true }
	}
});
