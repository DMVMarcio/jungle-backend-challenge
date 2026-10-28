import { InboxMessage } from './inbox-message';

export interface IInboxRepository {
	findByMessageIdAndConsumer(messageId: string, consumerName: string): Promise<InboxMessage | null>;

	create(message: InboxMessage): Promise<void>;
	update(message: InboxMessage): Promise<void>;
}
