import { Money } from '@/shared/domain/money/money';
import { CurrencyMismatchError } from '@/shared/domain/money/money.errors';

import { LedgerDirection, WalletLedgerEntry } from './wallet-ledger-entry';
import { InsufficientFundsError, InvalidInitialBalanceError } from './wallet.errors';

export interface OpenWalletProps {
	id?: string;
	playerId: string;
	initialBalance: Money;
	createdAt?: Date;
}

export interface WalletState {
	id: string;
	playerId: string;
	currency: string;
	balance: Money;
	version: number;
	createdAt: Date;
	updatedAt: Date;
}

export class Wallet {
	private constructor(
		public readonly id: string,
		public readonly playerId: string,
		public readonly currency: string,
		private _balance: Money,
		private _version: number,
		public readonly createdAt: Date,
		private _updatedAt: Date
	) {}

	static open(props: OpenWalletProps): Wallet {
		if (props.initialBalance.isNegative()) throw new InvalidInitialBalanceError(props.initialBalance.toString());

		const createdAt = props.createdAt ?? new Date();

		return new Wallet(
			props.id ?? crypto.randomUUID(),
			props.playerId,
			props.initialBalance.currency,
			props.initialBalance,
			1,
			createdAt,
			createdAt
		);
	}

	static rehydrate(state: WalletState): Wallet {
		return new Wallet(
			state.id,
			state.playerId,
			state.currency,
			state.balance,
			state.version,
			state.createdAt,
			state.updatedAt
		);
	}

	get balance(): Money {
		return this._balance;
	}

	get version(): number {
		return this._version;
	}

	get updatedAt(): Date {
		return this._updatedAt;
	}

	credit(money: Money, transaction_id: string): WalletLedgerEntry {
		this.assertSameCurrency(money);

		const balanceBefore = this._balance;
		const balanceAfter = this._balance.add(money);

		this._balance = balanceAfter;
		this._version += 1;
		this._updatedAt = new Date();

		return WalletLedgerEntry.create({
			walletId: this.id,
			transactionId: transaction_id,
			direction: LedgerDirection.Credit,
			money,
			balanceBefore,
			balanceAfter,
			createdAt: this._updatedAt
		});
	}

	debit(money: Money, transaction_id: string): WalletLedgerEntry {
		this.assertSameCurrency(money);

		if (this._balance.isLessThan(money))
			throw new InsufficientFundsError(this._balance.toString(), money.toString());

		const balanceBefore = this._balance;
		const balanceAfter = this._balance.subtract(money);

		this._balance = balanceAfter;
		this._version += 1;
		this._updatedAt = new Date();

		return WalletLedgerEntry.create({
			walletId: this.id,
			transactionId: transaction_id,
			direction: LedgerDirection.Debit,
			money,
			balanceBefore,
			balanceAfter,
			createdAt: this._updatedAt
		});
	}

	private assertSameCurrency(money: Money): void {
		if (this.currency !== money.currency) throw new CurrencyMismatchError(this.currency, money.currency);
	}
}
