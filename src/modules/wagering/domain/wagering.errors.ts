import { BusinessRuleError, ConflictError } from '@/shared/domain/errors';

export class InvalidTransactionStateError extends ConflictError {
	readonly code = 'INVALID_TRANSACTION_STATE';

	constructor(current_status: string, action: string) {
		super(`Cannot perform '${action}' on transaction with terminal status '${current_status}'`);
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
