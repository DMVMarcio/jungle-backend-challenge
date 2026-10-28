import { BusinessRuleError, ConflictError, NotFoundError } from '@/shared/domain/errors';

export class InvalidTransactionStateError extends ConflictError {
	readonly code = 'INVALID_TRANSACTION_STATE';

	constructor(currentStatus: string, action: string) {
		super(`Cannot perform '${action}' on transaction with terminal status '${currentStatus}'`);
	}
}

export class IdempotencyConflictError extends ConflictError {
	readonly code = 'IDEMPOTENCY_CONFLICT';

	constructor(key: string) {
		super(`Idempotency conflict for key '${key}': request payload does not match original transaction`);
	}
}

export class MissingReferenceTransactionError extends BusinessRuleError {
	readonly code = 'MISSING_REFERENCE_TRANSACTION';

	constructor(kind: string) {
		super(`Operation '${kind}' requires a referenceExternalTransactionId`);
	}
}

export class InvalidTransactionOperationError extends BusinessRuleError {
	readonly code = 'INVALID_TRANSACTION_OPERATION';

	constructor(reason: string) {
		super(`Invalid transaction operation: ${reason}`);
	}
}

export class WagerTransactionNotFoundError extends NotFoundError {
	readonly code = 'WAGER_TRANSACTION_NOT_FOUND';

	constructor(identifier: string) {
		super(`Wager transaction '${identifier}' not found`);
	}
}
