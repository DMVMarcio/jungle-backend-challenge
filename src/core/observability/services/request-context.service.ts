import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContextStore {
	correlationId: string;
	messageId?: string;
	transactionId?: string;
	walletId?: string;
	providerId?: string;
}

@Injectable()
export class RequestContextService {
	private readonly storage = new AsyncLocalStorage<RequestContextStore>();

	runWithContext<T>(store: RequestContextStore, fn: () => T): T {
		return this.storage.run(store, fn);
	}

	getStore(): RequestContextStore | undefined {
		return this.storage.getStore();
	}

	getCorrelationId(): string | undefined {
		return this.storage.getStore()?.correlationId;
	}

	set(key: keyof RequestContextStore, value: string): void {
		const store = this.storage.getStore();
		if (store) {
			store[key] = value;
		}
	}
}
