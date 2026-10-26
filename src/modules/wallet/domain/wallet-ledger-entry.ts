import { Money } from '@/shared/domain/money/money';

export enum LedgerDirection {
	Debit = 'DEBIT',
	Credit = 'CREDIT'
}

export interface CreateLedgerEntryProps {
	id?: string;
	walletId: string;
	transactionId: string;
	direction: LedgerDirection;
	money: Money;
	balanceBefore: Money;
	balanceAfter: Money;
	createdAt?: Date;
}

export interface LedgerEntryState {
	id: string;
	walletId: string;
	transactionId: string;
	direction: LedgerDirection;
	money: Money;
	balanceBefore: Money;
	balanceAfter: Money;
	createdAt: Date;
}
