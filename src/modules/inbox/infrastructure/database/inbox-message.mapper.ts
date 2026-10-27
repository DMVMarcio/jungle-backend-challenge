import { InboxMessage } from '@/modules/inbox/domain/inbox-message';

import { InboxMessageDbRecord } from './inbox-message.schema';

export class InboxMessageMapper {
	static toDomain(record: InboxMessageDbRecord): InboxMessage {
		return InboxMessage.rehydrate({
			messageId: record.messageId,
			consumerName: record.consumerName,
			payloadHash: record.payloadHash,
			receivedAt: record.receivedAt,
			processedAt: record.processedAt
		});
	}

	static toPersistence(domain: InboxMessage): InboxMessageDbRecord {
		return {
			messageId: domain.messageId,
			consumerName: domain.consumerName,
			payloadHash: domain.payloadHash,
			receivedAt: domain.receivedAt,
			processedAt: domain.processedAt
		};
	}
}
