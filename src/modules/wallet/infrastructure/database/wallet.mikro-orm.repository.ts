import { EntityManager, LockMode } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';

import { Wallet } from '@/modules/wallet/domain/wallet';
import { IWalletRepository } from '@/modules/wallet/domain/wallet.repository.interface';

import { WalletMapper } from './wallet.mapper';
import { WalletSchema } from './wallet.schema';

@Injectable()
export class WalletMikroOrmRepository implements IWalletRepository {
	constructor(private readonly entityManager: EntityManager) {}

	async findById(id: string): Promise<Wallet | null> {
		const record = await this.entityManager.findOne(WalletSchema, { id });
		if (!record) return null;

		return WalletMapper.toDomain(record);
	}

	async findByIdWithLock(id: string): Promise<Wallet | null> {
		const record = await this.entityManager.findOne(WalletSchema, { id }, { lockMode: LockMode.PESSIMISTIC_WRITE });
		if (!record) return null;

		return WalletMapper.toDomain(record);
	}

	async findByPlayerIdAndCurrency(playerId: string, currency: string): Promise<Wallet | null> {
		const record = await this.entityManager.findOne(WalletSchema, { playerId, currency });
		if (!record) return null;

		return WalletMapper.toDomain(record);
	}

	async create(wallet: Wallet): Promise<void> {
		const walletRecord = this.entityManager.create(WalletSchema, WalletMapper.toPersistence(wallet));
		this.entityManager.persist(walletRecord);

		await this.entityManager.flush();
	}

	async update(wallet: Wallet): Promise<void> {
		const persistenceData = WalletMapper.toPersistence(wallet);
		const record = await this.entityManager.findOne(WalletSchema, { id: wallet.id });

		if (record) this.entityManager.assign(record, persistenceData);

		await this.entityManager.flush();
	}
}
