import { Money } from '@/shared/domain/money/money';

import { MissingReferenceTransactionError } from './wagering.errors';

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

export class WagerTransaction {
	private constructor(
		public readonly id: string,
		public readonly providerId: string,
		public readonly externalTransactionId: string,
		public readonly idempotencyKey: string,
		public readonly payloadHash: string,
		public readonly walletId: string,
		public readonly playerId: string,
		public readonly roundId: string,
		public readonly gameId: string,
		public readonly kind: WagerTransactionKind,
		public readonly money: Money,
		public readonly referenceExternalTransactionId: string | undefined,
		public readonly createdAt: Date,

		private _status: WagerTransactionStatus,
		private _referenceTransactionId?: string,
		private _failureCode?: FailureCode,
		private _processedAt?: Date
	) {}

	static create(props: CreateWagerTransactionProps): WagerTransaction {
		const isReferenceRequired =
			props.kind === WagerTransactionKind.Refund || props.kind === WagerTransactionKind.Rollback;

		if (isReferenceRequired && !props.referenceExternalTransactionId?.trim())
			throw new MissingReferenceTransactionError(props.kind);

		return new WagerTransaction(
			props.id ?? crypto.randomUUID(),
			props.providerId,
			props.externalTransactionId,
			props.idempotencyKey,
			props.payloadHash,
			props.walletId,
			props.playerId,
			props.roundId,
			props.gameId,
			props.kind,
			props.money,
			props.referenceExternalTransactionId?.trim(),
			props.createdAt ?? new Date(),
			WagerTransactionStatus.Pending
		);
	}

	static rehydrate(state: WagerTransactionState): WagerTransaction {
		return new WagerTransaction(
			state.id,
			state.providerId,
			state.externalTransactionId,
			state.idempotencyKey,
			state.payloadHash,
			state.walletId,
			state.playerId,
			state.roundId,
			state.gameId,
			state.kind,
			state.money,
			state.referenceExternalTransactionId,
			state.createdAt,
			state.status,
			state.referenceTransactionId,
			state.failureCode,
			state.processedAt
		);
	}

	get status(): WagerTransactionStatus {
		return this._status;
	}

	get referenceTransactionId(): string | undefined {
		return this._referenceTransactionId;
	}

	get failureCode(): FailureCode | undefined {
		return this._failureCode;
	}

	get processedAt(): Date | undefined {
		return this._processedAt;
	}
}
