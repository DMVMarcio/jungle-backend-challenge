import { Money } from '@/shared/domain/money/money';

export enum WagerTransactionKind {
	Opening = 'OPENING',
	Bet = 'BET',
	Win = 'WIN',
	Loss = 'LOSS',
	Refund = 'REFUND',
	Rollback = 'ROLLBACK'
}

export enum WagerTransactionStatus {
	Pending = 'PENDING',
	PendingReference = 'PENDING_REFERENCE',
	Processed = 'PROCESSED',
	Rejected = 'REJECTED',
	Failed = 'FAILED'
}

export type FailureCode =
	| 'INSUFFICIENT_FUNDS'
	| 'REFERENCE_NOT_FOUND'
	| 'REFERENCE_ALREADY_REVERSED'
	| 'INVALID_REFERENCE_KIND'
	| 'AMOUNT_MISMATCH'
	| 'NEGATIVE_BALANCE_PREVENTED'
	| 'IDEMPOTENCY_CONFLICT'
	| 'CURRENCY_MISMATCH';

export interface CreateWagerTransactionProps {
	id?: string;
	providerId: string;
	externalTransactionId: string;
	idempotencyKey: string;
	payloadHash: string;
	walletId: string;
	playerId: string;
	roundId: string;
	gameId: string;
	kind: WagerTransactionKind;
	money: Money;
	referenceExternalTransactionId?: string;
	createdAt?: Date;
}

export interface WagerTransactionState {
	id: string;
	providerId: string;
	externalTransactionId: string;
	idempotencyKey: string;
	payloadHash: string;
	walletId: string;
	playerId: string;
	roundId: string;
	gameId: string;
	kind: WagerTransactionKind;
	money: Money;
	referenceExternalTransactionId?: string;
	referenceTransactionId?: string;
	status: WagerTransactionStatus;
	failureCode?: FailureCode;
	createdAt: Date;
	processedAt?: Date;
}
