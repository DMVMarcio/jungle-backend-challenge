import { WagerTransaction } from '@/modules/wagering/domain/wager-transaction';

import { Money } from '@/shared/domain/money/money';

import { WagerTransactionDbRecord } from './wager-transaction.schema';

export class WagerTransactionMapper {
	static toDomain(record: WagerTransactionDbRecord): WagerTransaction {
		return WagerTransaction.rehydrate({
			id: record.id,
			providerId: record.providerId,
			externalTransactionId: record.externalTransactionId,
			idempotencyKey: record.idempotencyKey,
			payloadHash: record.payloadHash,
			walletId: record.walletId,
			playerId: record.playerId,
			roundId: record.roundId,
			gameId: record.gameId,
			kind: record.kind,
			money: Money.from({ amount: record.amount, currency: record.currency }),
			referenceExternalTransactionId: record.referenceExternalTransactionId,
			referenceTransactionId: record.referenceTransactionId,
			status: record.status,
			failureCode: record.failureCode,
			balanceAfter: record.balanceAfter
				? Money.from({ amount: record.balanceAfter, currency: record.currency })
				: undefined,
			attempts: record.attempts,
			nextAttemptAt: record.nextAttemptAt,
			createdAt: record.createdAt,
			processedAt: record.processedAt
		});
	}

	static toPersistence(domain: WagerTransaction): WagerTransactionDbRecord {
		return {
			id: domain.id,
			providerId: domain.providerId,
			externalTransactionId: domain.externalTransactionId,
			idempotencyKey: domain.idempotencyKey,
			payloadHash: domain.payloadHash,
			walletId: domain.walletId,
			playerId: domain.playerId,
			roundId: domain.roundId,
			gameId: domain.gameId,
			kind: domain.kind,
			amount: domain.money.toJSON().amount,
			currency: domain.money.currency,
			referenceExternalTransactionId: domain.referenceExternalTransactionId,
			referenceTransactionId: domain.referenceTransactionId,
			status: domain.status,
			failureCode: domain.failureCode,
			balanceAfter: domain.balanceAfter ? domain.balanceAfter.toJSON().amount : undefined,
			attempts: domain.attempts,
			nextAttemptAt: domain.nextAttemptAt,
			createdAt: domain.createdAt,
			processedAt: domain.processedAt
		};
	}
}
