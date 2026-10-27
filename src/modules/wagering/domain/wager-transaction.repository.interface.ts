import { WagerTransaction } from './wager-transaction';

export interface IWagerTransactionRepository {
	findById(id: string): Promise<WagerTransaction | null>;
	findByIdempotencyKey(key: string): Promise<WagerTransaction | null>;
	findByProviderAndExternalId(providerId: string, externalTransactionId: string): Promise<WagerTransaction | null>;
	findPendingReferences(limit?: number): Promise<WagerTransaction[]>;

	create(transaction: WagerTransaction): Promise<void>;
	update(transaction: WagerTransaction): Promise<void>;
}
