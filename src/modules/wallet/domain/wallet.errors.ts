import { DomainError } from '@/shared/domain/errors';

export class InsufficientFundsError extends DomainError {
	readonly code = 'INSUFFICIENT_FUNDS';

	constructor(current_balance: string, requested_amount: string) {
		super(`Insufficient funds: current balance is ${current_balance}, requested ${requested_amount}`);
	}
}

export class UnbalancedLedgerEntryError extends DomainError {
	readonly code = 'UNBALANCED_LEDGER_ENTRY';

	constructor(reason: string) {
		super(`Unbalanced ledger entry: ${reason}`);
	}
}
