import { Wallet } from './wallet';

export interface IWalletRepository {
	findById(id: string): Promise<Wallet | null>;
	findByIdWithLock(id: string): Promise<Wallet | null>;
	findByPlayerIdAndCurrency(playerId: string, currency: string): Promise<Wallet | null>;

	create(wallet: Wallet): Promise<void>;
	update(wallet: Wallet): Promise<void>;
}
