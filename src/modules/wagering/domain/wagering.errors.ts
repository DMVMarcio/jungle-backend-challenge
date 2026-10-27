import { DomainError } from '@/shared/domain/errors';

export class InvalidTransactionStateError extends DomainError {
	readonly code = 'INVALID_TRANSACTION_STATE';

	constructor(current_status: string, action: string) {
		super(`Cannot perform '${action}' on transaction with terminal status '${current_status}'`);
	}
}

export class MissingReferenceTransactionError extends DomainError {
	readonly code = 'MISSING_REFERENCE_TRANSACTION';

	constructor(kind: string) {
		super(`Operation '${kind}' requires a referenceExternalTransactionId`);
	}
}
