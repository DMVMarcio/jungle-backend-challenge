import { Wallet } from './wallet';
import { WalletLedgerEntry } from './wallet-ledger-entry';

export interface IWalletRepository {
	findById(id: string): Promise<Wallet | null>;
	findByIdWithLock(id: string): Promise<Wallet | null>;
	findByPlayerIdAndCurrency(playerId: string, currency: string): Promise<Wallet | null>;

	create(wallet: Wallet, ledgerEntry?: WalletLedgerEntry): Promise<void>;
	update(wallet: Wallet, ledgerEntry: WalletLedgerEntry): Promise<void>;
}
