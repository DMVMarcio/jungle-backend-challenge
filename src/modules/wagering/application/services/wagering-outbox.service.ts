import { Inject, Injectable } from '@nestjs/common';

import { OutboxMessage } from '@/modules/outbox/domain/outbox-message';
import type { IOutboxRepository } from '@/modules/outbox/domain/outbox.repository.interface';
import { OUTBOX_TOKENS } from '@/modules/outbox/outbox.tokens';

import { Money } from '@/shared/domain/money/money';
import type { IIdGenerator } from '@/shared/ports/id-generator.port';
import { SHARED_TOKENS } from '@/shared/shared.tokens';

import { WagerTransaction, WagerTransactionStatus } from '../../domain/wager-transaction';

@Injectable()
export class WageringOutboxService {
	constructor(
		@Inject(OUTBOX_TOKENS.REPOSITORY)
		private readonly outboxRepository: IOutboxRepository,

		@Inject(SHARED_TOKENS.ID_GENERATOR)
		private readonly idGenerator: IIdGenerator
	) {}

	async enqueue(transaction: WagerTransaction, aggregateId: string, currentBalance: Money): Promise<void> {
		if (transaction.status === WagerTransactionStatus.Processed) {
			const payload: Record<string, unknown> = {
				transactionId: transaction.id,
				providerId: transaction.providerId,
				externalTransactionId: transaction.externalTransactionId,
				playerId: transaction.playerId,
				walletId: transaction.walletId,
				roundId: transaction.roundId,
				gameId: transaction.gameId,
				kind: transaction.kind,
				money: transaction.money.toJSON(),
				balanceAfter: currentBalance.toJSON(),
				occurredAt: (transaction.processedAt ?? new Date()).toISOString()
			};

			const outboxMsg = OutboxMessage.enqueue({
				id: this.idGenerator.generate(),
				aggregateId,
				eventType: 'WagerTransactionProcessed',
				payload,
				occurredAt: transaction.processedAt
			});

			await this.outboxRepository.create(outboxMsg);
		} else if (transaction.status === WagerTransactionStatus.Rejected) {
			const payload: Record<string, unknown> = {
				transactionId: transaction.id,
				providerId: transaction.providerId,
				externalTransactionId: transaction.externalTransactionId,
				playerId: transaction.playerId,
				walletId: transaction.walletId,
				failureCode: transaction.failureCode,
				occurredAt: (transaction.processedAt ?? new Date()).toISOString()
			};

			const outboxMsg = OutboxMessage.enqueue({
				id: this.idGenerator.generate(),
				aggregateId,
				eventType: 'WagerTransactionRejected',
				payload,
				occurredAt: transaction.processedAt
			});

			await this.outboxRepository.create(outboxMsg);
		}
	}
}
