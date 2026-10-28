import { beforeEach, describe, expect, it } from 'bun:test';

import { WagerTransaction, WagerTransactionKind } from '@/modules/wagering/domain/wager-transaction';
import { WagerTransactionNotFoundError } from '@/modules/wagering/domain/wagering.errors';
import { WagerTransactionMemoryRepository } from '@/modules/wagering/infrastructure/database/wager-transaction.memory.repository';

import { Money } from '@/shared/domain/money/money';

import { GetWagerTransactionUseCase } from './get-wager-transaction.use-case';

describe('Get WagerTransaction UseCase', () => {
	let sut: GetWagerTransactionUseCase;

	let wageringRepository: WagerTransactionMemoryRepository;

	beforeEach(() => {
		wageringRepository = new WagerTransactionMemoryRepository();

		sut = new GetWagerTransactionUseCase(wageringRepository);
	});

	it('should return transaction data when transaction exists', async () => {
		const transaction = WagerTransaction.create({
			id: 'transaction-1',
			providerId: 'provider-a',
			externalTransactionId: 'ext-1',
			idempotencyKey: 'idemp-1',
			payloadHash: 'hash-1',
			walletId: 'wallet-1',
			playerId: 'player-1',
			roundId: 'round-1',
			gameId: 'game-1',
			kind: WagerTransactionKind.Bet,
			money: Money.from({ amount: '50.00', currency: 'BRL' })
		});
		await wageringRepository.create(transaction);

		const result = await sut.execute({ transactionId: 'transaction-1' });

		expect(result.id).toBe('transaction-1');
		expect(result.providerId).toBe('provider-a');
		expect(result.externalTransactionId).toBe('ext-1');
		expect(result.kind).toBe(WagerTransactionKind.Bet);
		expect(result.money).toEqual({ amount: '50.00', currency: 'BRL' });
	});

	it('should throw WagerTransactionNotFoundError when transaction does not exist', async () => {
		expect(sut.execute({ transactionId: 'non-existent' })).rejects.toThrow(WagerTransactionNotFoundError);
	});
});
