export interface IntegrationEvent<T = Record<string, unknown>> {
	id?: string;
	aggregateId: string;
	eventType: string;
	payload: T;
	occurredAt?: Date;
}

export interface OutboxMessageState {
	id: string;
	aggregateId: string;
	eventType: string;
	payload: Readonly<Record<string, unknown>>;
	occurredAt: Date;
	attempts: number;
	nextAttemptAt?: Date;
	publishedAt?: Date;
}

export class OutboxMessage {
	private constructor(
		public readonly id: string,
		public readonly aggregateId: string,
		public readonly eventType: string,
		public readonly payload: Readonly<Record<string, unknown>>,
		public readonly occurredAt: Date,

		private _attempts: number,
		private _nextAttemptAt?: Date,
		private _publishedAt?: Date
	) {}

	static enqueue(event: IntegrationEvent<Record<string, unknown>>): OutboxMessage {
		return new OutboxMessage(
			event.id ?? crypto.randomUUID(),
			event.aggregateId,
			event.eventType,
			Object.freeze({ ...event.payload }),
			event.occurredAt ?? new Date(),
			0
		);
	}

	static rehydrate(state: OutboxMessageState): OutboxMessage {
		return new OutboxMessage(
			state.id,
			state.aggregateId,
			state.eventType,
			state.payload,
			state.occurredAt,
			state.attempts,
			state.nextAttemptAt,
			state.publishedAt
		);
	}

	get attempts(): number {
		return this._attempts;
	}

	get nextAttemptAt(): Date | undefined {
		return this._nextAttemptAt;
	}

	get publishedAt(): Date | undefined {
		return this._publishedAt;
	}

	isPending(): boolean {
		return this._publishedAt === undefined;
	}

	isDue(now: Date = new Date()): boolean {
		if (!this.isPending()) return false;
		if (!this._nextAttemptAt) return true;

		return this._nextAttemptAt <= now;
	}

	markPublished(at: Date = new Date()): void {
		this._publishedAt = at;
	}

	scheduleRetry(now: Date = new Date()): void {
		this._attempts += 1;

		const delaySeconds = Math.min(300, Math.pow(2, this._attempts));
		this._nextAttemptAt = new Date(now.getTime() + delaySeconds * 1000);
	}
}
