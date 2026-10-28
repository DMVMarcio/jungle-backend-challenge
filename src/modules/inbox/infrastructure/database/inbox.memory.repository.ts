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

	async update(message: InboxMessage): Promise<void> {
		const index = this.items.findIndex(
			item => item.messageId === message.messageId && item.consumerName === message.consumerName
		);

		if (index >= 0) this.items[index] = message;
	}
}
