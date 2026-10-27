import { beforeEach, describe, expect, it } from 'bun:test';

import { Wallet } from '@/modules/wallet/domain/wallet';
import { WalletNotFoundError } from '@/modules/wallet/domain/wallet.errors';
import { WalletMemoryRepository } from '@/modules/wallet/infrastructure/database/wallet.memory.repository';

import { Money } from '@/shared/domain/money/money';

import { GetWalletUseCase } from './get-wallet.use-case';

describe('Get Wallet UseCase', () => {
	let sut: GetWalletUseCase;

	let walletRepository: WalletMemoryRepository;

	beforeEach(() => {
		walletRepository = new WalletMemoryRepository();

		sut = new GetWalletUseCase(walletRepository);
	});

	it('should return wallet data when wallet is found', async () => {
		const wallet = Wallet.open({
			id: 'wallet-1',
			playerId: 'player-1',
			initialBalance: Money.from({ amount: '250.00', currency: 'BRL' })
		});

		await walletRepository.create(wallet);

		const output = await sut.execute({ walletId: 'wallet-1' });

		expect(output.id).toBe('wallet-1');
		expect(output.playerId).toBe('player-1');
		expect(output.balance).toEqual({ amount: '250.00', currency: 'BRL' });
		expect(output.version).toBe(1);
	});

	it('should throw WalletNotFoundError when wallet does not exist', async () => {
		expect(sut.execute({ walletId: 'non-existing-wallet' })).rejects.toBeInstanceOf(WalletNotFoundError);
	});
});
