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

export class InvalidInitialBalanceError extends DomainError {
	readonly code = 'INVALID_INITIAL_BALANCE';

	constructor(amount: string) {
		super(`Initial balance cannot be negative, received: ${amount}`);
	}
}

export class WalletAlreadyExistsError extends DomainError {
	readonly code = 'WALLET_ALREADY_EXISTS';
	constructor(playerId: string, currency: string) {
		super(`Wallet already exists for player ${playerId} with currency ${currency}`);
	}
}
