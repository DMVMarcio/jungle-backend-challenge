import { OutboxMessage } from './outbox-message';

export interface IOutboxRepository {
	findPendingDue(limit?: number, now?: Date): Promise<OutboxMessage[]>;
	countPending(): Promise<number>;
	create(message: OutboxMessage): Promise<void>;
	update(message: OutboxMessage): Promise<void>;
	updateMany(messages: OutboxMessage[]): Promise<void>;
}
