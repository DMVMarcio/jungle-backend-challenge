import { Money } from '@/shared/domain/money/money';

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

	get balance(): Money {
		return this._balance;
	}

	get version(): number {
		return this._version;
	}

	get updatedAt(): Date {
		return this._updatedAt;
	}
}
