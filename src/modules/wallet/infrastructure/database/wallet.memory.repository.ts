import { Injectable } from '@nestjs/common';

import { Wallet } from '../../domain/wallet';
import { IWalletRepository } from '../../domain/wallet.repository.interface';

@Injectable()
export class WalletMemoryRepository implements IWalletRepository {
	readonly items: Wallet[] = [];

	async findById(id: string): Promise<Wallet | null> {
		return this.items.find(item => item.id === id) ?? null;
	}

	async findByIdWithLock(id: string): Promise<Wallet | null> {
		return this.findById(id);
	}

	async findByPlayerIdAndCurrency(playerId: string, currency: string): Promise<Wallet | null> {
		return this.items.find(item => item.playerId === playerId && item.currency === currency) ?? null;
	}

	async create(wallet: Wallet): Promise<void> {
		this.items.push(wallet);
	}

	async update(wallet: Wallet): Promise<void> {
		const index = this.items.findIndex(item => item.id === wallet.id);
		if (index >= 0) this.items[index] = wallet;
	}
}
