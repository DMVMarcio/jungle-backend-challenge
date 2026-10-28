import { LedgerDirection } from '@/modules/wallet/domain/wallet-ledger-entry';

import { Money } from '@/shared/domain/money/money';

import {
	InvalidTransactionOperationError,
	InvalidTransactionStateError,
	MissingReferenceTransactionError
} from './wagering.errors';

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
	static readonly TERMINAL_STATUSES: ReadonlySet<WagerTransactionStatus> = new Set([
		WagerTransactionStatus.Processed,
		WagerTransactionStatus.Rejected,
		WagerTransactionStatus.Failed
	]);

	static readonly REFERENCE_REQUIRED_KINDS: ReadonlySet<WagerTransactionKind> = new Set([
		WagerTransactionKind.Refund,
		WagerTransactionKind.Rollback
	]);

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
		const isReferenceRequired = WagerTransaction.requiresReference(props.kind);

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

	markProcessed(referenceTransactionId?: string, at: Date = new Date()): void {
		this.assertNotTerminal('markProcessed');

		this._status = WagerTransactionStatus.Processed;
		this._referenceTransactionId = referenceTransactionId;
		this._processedAt = at;
	}

	markPendingReference(): void {
		this.assertNotTerminal('markPendingReference');

		this._status = WagerTransactionStatus.PendingReference;
	}

	reject(code: FailureCode): void {
		this.assertNotTerminal('reject');

		this._status = WagerTransactionStatus.Rejected;
		this._failureCode = code;
		this._processedAt = new Date();
	}

	fail(code: FailureCode): void {
		this.assertNotTerminal('fail');

		this._status = WagerTransactionStatus.Failed;
		this._failureCode = code;
		this._processedAt = new Date();
	}

	isTerminal(): boolean {
		return WagerTransaction.TERMINAL_STATUSES.has(this._status);
	}

	affectsBalance(): boolean {
		return this.kind !== WagerTransactionKind.Loss;
	}

	requiresReference(): boolean {
		return WagerTransaction.requiresReference(this.kind);
	}

	matchesPayload(payloadHash: string): boolean {
		return this.payloadHash === payloadHash;
	}

	validateReference(reference: WagerTransaction): FailureCode | null {
		if (
			reference.providerId !== this.providerId ||
			reference.playerId !== this.playerId ||
			reference.walletId !== this.walletId ||
			reference.roundId !== this.roundId ||
			reference.money.currency !== this.money.currency
		)
			return 'REFERENCE_NOT_FOUND';

		if (reference.status !== WagerTransactionStatus.Processed) return 'REFERENCE_NOT_FOUND';

		if (
			(this.kind === WagerTransactionKind.Refund || this.kind === WagerTransactionKind.Win) &&
			reference.kind !== WagerTransactionKind.Bet
		)
			return 'INVALID_REFERENCE_KIND';

		if (
			this.kind === WagerTransactionKind.Rollback &&
			reference.kind !== WagerTransactionKind.Bet &&
			reference.kind !== WagerTransactionKind.Win &&
			reference.kind !== WagerTransactionKind.Refund
		)
			return 'INVALID_REFERENCE_KIND';

		if (
			(this.kind === WagerTransactionKind.Refund || this.kind === WagerTransactionKind.Rollback) &&
			!reference.money.equals(this.money)
		)
			return 'AMOUNT_MISMATCH';

		return null;
	}

	ledgerDirectionFor(reference?: WagerTransaction): LedgerDirection {
		switch (this.kind) {
			case WagerTransactionKind.Bet:
				return LedgerDirection.Debit;
			case WagerTransactionKind.Win:
			case WagerTransactionKind.Opening:
			case WagerTransactionKind.Refund:
				return LedgerDirection.Credit;
			case WagerTransactionKind.Rollback:
				if (!reference) throw new MissingReferenceTransactionError('ROLLBACK');

				return reference.ledgerDirectionFor() === LedgerDirection.Debit
					? LedgerDirection.Credit
					: LedgerDirection.Debit;
			case WagerTransactionKind.Loss:
				throw new InvalidTransactionOperationError('LOSS operations do not produce ledger entries');
		}
	}

	private assertNotTerminal(action: string): void {
		if (this.isTerminal()) throw new InvalidTransactionStateError(this._status, action);
	}

	static requiresReference(kind: WagerTransactionKind): boolean {
		return WagerTransaction.REFERENCE_REQUIRED_KINDS.has(kind);
	}
}
