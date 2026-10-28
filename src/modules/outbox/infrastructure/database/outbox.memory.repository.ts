import { Injectable } from '@nestjs/common';

import { OutboxMessage } from '../../domain/outbox-message';
import { IOutboxRepository } from '../../domain/outbox.repository.interface';

@Injectable()
export class OutboxMemoryRepository implements IOutboxRepository {
	readonly items: OutboxMessage[] = [];

	async findPendingDue(limit = 50, now: Date = new Date()): Promise<OutboxMessage[]> {
		return this.items.filter(m => m.isDue(now)).slice(0, limit);
	}

	async countPending(): Promise<number> {
		return this.items.filter(m => m.isPending()).length;
	}

	async create(message: OutboxMessage): Promise<void> {
		this.items.push(message);
	}

	async update(message: OutboxMessage): Promise<void> {
		const index = this.items.findIndex(item => item.id === message.id);
		if (index >= 0) this.items[index] = message;
	}

	async updateMany(messages: OutboxMessage[]): Promise<void> {
		for (const message of messages) {
			await this.update(message);
		}
	}
}
