import { Injectable } from '@nestjs/common';

import { Wallet } from '../../domain/wallet';
import { WalletLedgerEntry } from '../../domain/wallet-ledger-entry';
import { IWalletRepository } from '../../domain/wallet.repository.interface';

@Injectable()
export class WalletMemoryRepository implements IWalletRepository {
	readonly items: Wallet[] = [];
	readonly ledgerEntries: WalletLedgerEntry[] = [];

	async findById(id: string): Promise<Wallet | null> {
		return this.items.find(item => item.id === id) ?? null;
	}

	async findByIdWithLock(id: string): Promise<Wallet | null> {
		return this.findById(id);
	}

	async findByPlayerIdAndCurrency(playerId: string, currency: string): Promise<Wallet | null> {
		return this.items.find(item => item.playerId === playerId && item.currency === currency) ?? null;
	}

	async create(wallet: Wallet, ledgerEntry?: WalletLedgerEntry): Promise<void> {
		this.items.push(wallet);
		if (ledgerEntry) this.ledgerEntries.push(ledgerEntry);
	}

	async update(wallet: Wallet, ledgerEntry: WalletLedgerEntry): Promise<void> {
		const index = this.items.findIndex(item => item.id === wallet.id);
		if (index >= 0) this.items[index] = wallet;

		this.ledgerEntries.push(ledgerEntry);
	}
}
