import { OutboxMessage } from './outbox-message';

export interface IOutboxRepository {
	findPendingDue(limit?: number, now?: Date): Promise<OutboxMessage[]>;

	create(message: OutboxMessage): Promise<void>;
	update(message: OutboxMessage): Promise<void>;
}
