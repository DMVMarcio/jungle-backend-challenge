import { Money } from '@/shared/domain/money/money';

import { UnbalancedLedgerEntryError } from './wallet.errors';

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

export class WalletLedgerEntry {
	private constructor(
		public readonly id: string,
		public readonly walletId: string,
		public readonly transactionId: string,
		public readonly direction: LedgerDirection,
		public readonly money: Money,
		public readonly balanceBefore: Money,
		public readonly balanceAfter: Money,
		public readonly createdAt: Date
	) {}

	static create(props: CreateLedgerEntryProps): WalletLedgerEntry {
		const entry = new WalletLedgerEntry(
			props.id ?? crypto.randomUUID(),
			props.walletId,
			props.transactionId,
			props.direction,
			props.money,
			props.balanceBefore,
			props.balanceAfter,
			props.createdAt ?? new Date()
		);

		if (!entry.isBalanced()) {
			const directionSignal = props.direction === LedgerDirection.Credit ? '+' : '-';

			throw new UnbalancedLedgerEntryError(
				`Invalid ledger arithmetic: ${props.balanceBefore} ${directionSignal} ${props.money} is not equal to ${props.balanceAfter}`
			);
		}

		return entry;
	}

	static rehydrate(state: LedgerEntryState): WalletLedgerEntry {
		return new WalletLedgerEntry(
			state.id,
			state.walletId,
			state.transactionId,
			state.direction,
			state.money,
			state.balanceBefore,
			state.balanceAfter,
			state.createdAt
		);
	}

	isBalanced(): boolean {
		if (this.direction === LedgerDirection.Credit)
			return this.balanceBefore.add(this.money).equals(this.balanceAfter);

		return this.balanceBefore.subtract(this.money).equals(this.balanceAfter);
	}
}
