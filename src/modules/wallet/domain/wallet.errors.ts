import { DomainError } from '@/shared/domain/errors';

export class UnbalancedLedgerEntryError extends DomainError {
	readonly code = 'UNBALANCED_LEDGER_ENTRY';

	constructor(reason: string) {
		super(`Unbalanced ledger entry: ${reason}`);
	}
}
