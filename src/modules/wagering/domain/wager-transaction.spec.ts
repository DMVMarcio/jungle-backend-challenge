import { describe, expect, it } from 'bun:test';

import { Money } from '@/shared/domain/money/money';

import { WagerTransaction, WagerTransactionKind, WagerTransactionStatus } from './wager-transaction';
import { InvalidTransactionStateError } from './wagering.errors';

describe('WagerTransaction', () => {
	const baseProps = {
		providerId: 'provider-a',
		externalTransactionId: 'tx-ext-100',
		idempotencyKey: 'provider-a:tx-ext-100',
		payloadHash: 'hash-abc-123',
		walletId: 'wallet-1',
		playerId: 'player-1',
		roundId: 'round-1',
		gameId: 'game-1',
		money: Money.from({ amount: '25.00', currency: 'BRL' })
	};

	describe('State Transitions & Terminal Invariants', () => {
		it('should transition to PROCESSED and set processedAt', () => {
			const transaction = WagerTransaction.create({ ...baseProps, kind: WagerTransactionKind.Bet });
			const processedAt = new Date();

			transaction.markProcessed('ref-internal-id', processedAt);

			expect(transaction.status).toBe(WagerTransactionStatus.Processed);
			expect(transaction.referenceTransactionId).toBe('ref-internal-id');
			expect(transaction.processedAt).toBe(processedAt);
			expect(transaction.isTerminal()).toBe(true);
		});

		it('should transition to REJECTED and set failureCode', () => {
			const transaction = WagerTransaction.create({ ...baseProps, kind: WagerTransactionKind.Bet });

			transaction.reject('INSUFFICIENT_FUNDS');

			expect(transaction.status).toBe(WagerTransactionStatus.Rejected);
			expect(transaction.failureCode).toBe('INSUFFICIENT_FUNDS');
			expect(transaction.isTerminal()).toBe(true);
		});

		it('should transition to PENDING_REFERENCE', () => {
			const transaction = WagerTransaction.create({
				...baseProps,
				kind: WagerTransactionKind.Refund,
				referenceExternalTransactionId: 'ref-out-of-order'
			});

			transaction.markPendingReference();

			expect(transaction.status).toBe(WagerTransactionStatus.PendingReference);
			expect(transaction.isTerminal()).toBe(false);
		});

		it('should prevent any transition once in a terminal state (PROCESSED)', () => {
			const transaction = WagerTransaction.create({ ...baseProps, kind: WagerTransactionKind.Bet });

			transaction.markProcessed();

			expect(() => transaction.markProcessed()).toThrow(InvalidTransactionStateError);
			expect(() => transaction.reject('INSUFFICIENT_FUNDS')).toThrow(InvalidTransactionStateError);
			expect(() => transaction.fail('IDEMPOTENCY_CONFLICT')).toThrow(InvalidTransactionStateError);
			expect(() => transaction.markPendingReference()).toThrow(InvalidTransactionStateError);
		});

		it('should prevent any transition once in a terminal state (REJECTED)', () => {
			const transaction = WagerTransaction.create({ ...baseProps, kind: WagerTransactionKind.Bet });

			transaction.reject('INSUFFICIENT_FUNDS');

			expect(() => transaction.markProcessed()).toThrow(InvalidTransactionStateError);
			expect(() => transaction.reject('INSUFFICIENT_FUNDS')).toThrow(InvalidTransactionStateError);
		});
	});

	describe('Idempotency Check', () => {
		it('should match identical payload hashes and detect conflicting hashes', () => {
			const tx = WagerTransaction.create({
				...baseProps,

				payloadHash: 'hash-original',
				kind: WagerTransactionKind.Bet
			});

			expect(tx.matchesPayload('hash-original')).toBe(true);
			expect(tx.matchesPayload('hash-different')).toBe(false);
		});
	});
});
