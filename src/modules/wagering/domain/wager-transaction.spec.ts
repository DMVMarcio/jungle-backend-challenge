import { describe, expect, it } from 'bun:test';

import { LedgerDirection } from '@/modules/wallet/domain/wallet-ledger-entry';

import { Money } from '@/shared/domain/money/money';

import { WagerTransaction, WagerTransactionKind, WagerTransactionStatus } from './wager-transaction';
import {
	InvalidTransactionOperationError,
	InvalidTransactionStateError,
	MissingReferenceTransactionError
} from './wagering.errors';

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

	describe('Creation & Validation', () => {
		it('should create a valid BET transaction in PENDING status', () => {
			const transaction = WagerTransaction.create({
				...baseProps,

				kind: WagerTransactionKind.Bet
			});

			expect(transaction.status).toBe(WagerTransactionStatus.Pending);
			expect(transaction.isTerminal()).toBe(false);
			expect(transaction.affectsBalance()).toBe(true);
			expect(transaction.id).toBeDefined();
		});

		it('should identify LOSS as not affecting balance', () => {
			const tx = WagerTransaction.create({
				...baseProps,

				kind: WagerTransactionKind.Loss
			});
			expect(tx.affectsBalance()).toBe(false);
		});

		it('should throw MissingReferenceTransactionError when REFUND or ROLLBACK is created without reference', () => {
			expect(() =>
				WagerTransaction.create({
					...baseProps,

					kind: WagerTransactionKind.Refund
				})
			).toThrow(MissingReferenceTransactionError);

			expect(() =>
				WagerTransaction.create({
					...baseProps,

					kind: WagerTransactionKind.Rollback,
					referenceExternalTransactionId: '   '
				})
			).toThrow(MissingReferenceTransactionError);
		});

		it('should create REFUND when reference is provided', () => {
			const transaction = WagerTransaction.create({
				...baseProps,

				kind: WagerTransactionKind.Refund,
				referenceExternalTransactionId: 'original-bet-tx'
			});

			expect(transaction.referenceExternalTransactionId).toBe('original-bet-tx');
			expect(transaction.requiresReference()).toBe(true);
		});
	});

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
			const transaction = WagerTransaction.create({
				...baseProps,

				payloadHash: 'hash-original',
				kind: WagerTransactionKind.Bet
			});

			expect(transaction.matchesPayload('hash-original')).toBe(true);
			expect(transaction.matchesPayload('hash-different')).toBe(false);
		});
	});

	describe('Ledger Directions', () => {
		it('should return DEBIT for BET', () => {
			const betTransaction = WagerTransaction.create({ ...baseProps, kind: WagerTransactionKind.Bet });

			expect(betTransaction.ledgerDirectionFor()).toBe(LedgerDirection.Debit);
		});

		it('should return CREDIT for WIN, OPENING and REFUND', () => {
			const winTransaction = WagerTransaction.create({ ...baseProps, kind: WagerTransactionKind.Win });
			const refundTransaction = WagerTransaction.create({
				...baseProps,

				kind: WagerTransactionKind.Refund,
				referenceExternalTransactionId: 'tx-1'
			});

			expect(winTransaction.ledgerDirectionFor()).toBe(LedgerDirection.Credit);
			expect(refundTransaction.ledgerDirectionFor()).toBe(LedgerDirection.Credit);
		});

		it('should inverse direction for ROLLBACK', () => {
			const betTransaction = WagerTransaction.create({ ...baseProps, kind: WagerTransactionKind.Bet });
			const winTransaction = WagerTransaction.create({ ...baseProps, kind: WagerTransactionKind.Win });

			const rollbackBet = WagerTransaction.create({
				...baseProps,

				kind: WagerTransactionKind.Rollback,
				referenceExternalTransactionId: 'tx-bet'
			});

			const rollbackWin = WagerTransaction.create({
				...baseProps,

				kind: WagerTransactionKind.Rollback,
				referenceExternalTransactionId: 'tx-win'
			});

			expect(rollbackBet.ledgerDirectionFor(betTransaction)).toBe(LedgerDirection.Credit);
			expect(rollbackWin.ledgerDirectionFor(winTransaction)).toBe(LedgerDirection.Debit);
		});

		it('should throw when ledgerDirectionFor is called on LOSS or ROLLBACK without reference', () => {
			const lossTransaction = WagerTransaction.create({ ...baseProps, kind: WagerTransactionKind.Loss });
			const rollbackTransaction = WagerTransaction.create({
				...baseProps,

				kind: WagerTransactionKind.Rollback,
				referenceExternalTransactionId: 'tx-ref'
			});

			expect(() => lossTransaction.ledgerDirectionFor()).toThrow(InvalidTransactionOperationError);
			expect(() => rollbackTransaction.ledgerDirectionFor()).toThrow(MissingReferenceTransactionError);
		});
	});

	describe('Reference Validation', () => {
		const validBet = WagerTransaction.create({
			...baseProps,
			kind: WagerTransactionKind.Bet
		});
		validBet.markProcessed();

		it('should return REFERENCE_CONTEXT_MISMATCH when context fields differ', () => {
			const refundWrongRound = WagerTransaction.create({
				...baseProps,
				roundId: 'other-round',
				kind: WagerTransactionKind.Refund,
				referenceExternalTransactionId: validBet.externalTransactionId
			});

			expect(refundWrongRound.validateReference(validBet)).toBe('REFERENCE_CONTEXT_MISMATCH');

			const refundWrongPlayer = WagerTransaction.create({
				...baseProps,
				playerId: 'other-player',
				kind: WagerTransactionKind.Refund,
				referenceExternalTransactionId: validBet.externalTransactionId
			});

			expect(refundWrongPlayer.validateReference(validBet)).toBe('REFERENCE_CONTEXT_MISMATCH');

			const refundWrongCurrency = WagerTransaction.create({
				...baseProps,
				money: Money.from({ amount: '25.00', currency: 'USD' }),
				kind: WagerTransactionKind.Refund,
				referenceExternalTransactionId: validBet.externalTransactionId
			});

			expect(refundWrongCurrency.validateReference(validBet)).toBe('REFERENCE_CONTEXT_MISMATCH');
		});

		it('should return INVALID_REFERENCE_STATE when reference is not PROCESSED', () => {
			const pendingBet = WagerTransaction.create({
				...baseProps,
				kind: WagerTransactionKind.Bet
			});

			const refund = WagerTransaction.create({
				...baseProps,
				kind: WagerTransactionKind.Refund,
				referenceExternalTransactionId: pendingBet.externalTransactionId
			});

			expect(refund.validateReference(pendingBet)).toBe('INVALID_REFERENCE_STATE');
		});

		it('should return INVALID_REFERENCE_KIND when refund references non-bet transaction', () => {
			const winTx = WagerTransaction.create({
				...baseProps,
				kind: WagerTransactionKind.Win
			});
			winTx.markProcessed();

			const refund = WagerTransaction.create({
				...baseProps,
				kind: WagerTransactionKind.Refund,
				referenceExternalTransactionId: winTx.externalTransactionId
			});

			expect(refund.validateReference(winTx)).toBe('INVALID_REFERENCE_KIND');
		});

		it('should return AMOUNT_MISMATCH when amounts differ for refund', () => {
			const refund = WagerTransaction.create({
				...baseProps,
				money: Money.from({ amount: '10.00', currency: 'BRL' }),
				kind: WagerTransactionKind.Refund,
				referenceExternalTransactionId: validBet.externalTransactionId
			});

			expect(refund.validateReference(validBet)).toBe('AMOUNT_MISMATCH');
		});

		it('should return null when reference is valid and matches all invariants', () => {
			const refund = WagerTransaction.create({
				...baseProps,
				kind: WagerTransactionKind.Refund,
				referenceExternalTransactionId: validBet.externalTransactionId
			});

			expect(refund.validateReference(validBet)).toBeNull();
		});
	});

	describe('Balance & Attempt Tracking', () => {
		it('should record and retrieve balanceAfter', () => {
			const tx = WagerTransaction.create({
				...baseProps,
				kind: WagerTransactionKind.Bet
			});

			expect(tx.balanceAfter).toBeUndefined();

			const balance = Money.from({ amount: '75.00', currency: 'BRL' });
			tx.recordBalanceAfter(balance);

			expect(tx.balanceAfter?.equals(balance)).toBe(true);
		});

		it('should track attempts and nextAttemptAt, and allow resetting attempts', () => {
			const tx = WagerTransaction.create({
				...baseProps,
				kind: WagerTransactionKind.Refund,
				referenceExternalTransactionId: 'ref-1'
			});

			expect(tx.attempts).toBe(0);
			expect(tx.nextAttemptAt).toBeUndefined();

			const next = new Date(Date.now() + 5000);
			tx.recordAttempt(next);

			expect(tx.attempts).toBe(1);
			expect(tx.nextAttemptAt).toEqual(next);

			tx.recordAttempt(new Date(Date.now() + 10000));
			expect(tx.attempts).toBe(2);

			tx.resetAttempts();
			expect(tx.attempts).toBe(0);
			expect(tx.nextAttemptAt).toBeUndefined();
		});
	});
});
