import { Injectable } from '@nestjs/common';

import { InboxMessage } from '@/modules/inbox/domain/inbox-message';
import { IInboxRepository } from '@/modules/inbox/domain/inbox.repository.interface';

@Injectable()
export class InboxMemoryRepository implements IInboxRepository {
	readonly items: InboxMessage[] = [];

	async findByMessageIdAndConsumer(messageId: string, consumerName: string): Promise<InboxMessage | null> {
		return this.items.find(item => item.messageId === messageId && item.consumerName === consumerName) ?? null;
	}

	async create(message: InboxMessage): Promise<void> {
		this.items.push(message);
	}
}
