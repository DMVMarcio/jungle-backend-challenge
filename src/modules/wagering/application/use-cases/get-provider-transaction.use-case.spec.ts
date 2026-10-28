import { beforeEach, describe, expect, it } from 'bun:test';

import { WagerTransaction, WagerTransactionKind } from '@/modules/wagering/domain/wager-transaction';
import { WagerTransactionNotFoundError } from '@/modules/wagering/domain/wagering.errors';
import { WagerTransactionMemoryRepository } from '@/modules/wagering/infrastructure/database/wager-transaction.memory.repository';

import { Money } from '@/shared/domain/money/money';

import { GetProviderTransactionUseCase } from './get-provider-transaction.use-case';

describe('Get Provider Transaction UseCase', () => {
	let sut: GetProviderTransactionUseCase;

	let wageringRepository: WagerTransactionMemoryRepository;

	beforeEach(() => {
		wageringRepository = new WagerTransactionMemoryRepository();

		sut = new GetProviderTransactionUseCase(wageringRepository);
	});

	it('should return transaction when provider and external transaction exist', async () => {
		const transaction = WagerTransaction.create({
			id: 'transaction-1',
			providerId: 'provider-a',
			externalTransactionId: 'ext-100',
			idempotencyKey: 'idemp-1',
			payloadHash: 'hash-1',
			walletId: 'wallet-1',
			playerId: 'player-1',
			roundId: 'round-1',
			gameId: 'game-1',
			kind: WagerTransactionKind.Win,
			money: Money.from({ amount: '75.00', currency: 'BRL' })
		});
		await wageringRepository.create(transaction);

		const result = await sut.execute({
			providerId: 'provider-a',
			externalTransactionId: 'ext-100'
		});

		expect(result.id).toBe('transaction-1');
		expect(result.providerId).toBe('provider-a');
		expect(result.externalTransactionId).toBe('ext-100');
		expect(result.kind).toBe(WagerTransactionKind.Win);
		expect(result.money).toEqual({ amount: '75.00', currency: 'BRL' });
	});

	it('should throw WagerTransactionNotFoundError when not found', async () => {
		expect(
			sut.execute({
				providerId: 'unknown',
				externalTransactionId: 'unknown'
			})
		).rejects.toThrow(WagerTransactionNotFoundError);
	});
});
