import { Inject, Injectable, Optional } from '@nestjs/common';

import { RequestContextService } from '@/core/observability/services/request-context.service';

import { OutboxMessage } from '@/modules/outbox/domain/outbox-message';
import type { IOutboxRepository } from '@/modules/outbox/domain/outbox.repository.interface';
import { OUTBOX_TOKENS } from '@/modules/outbox/outbox.tokens';
import { WalletBalanceChanged } from '@/modules/wallet/domain/events/wallet-balance-changed.event';
import { Wallet } from '@/modules/wallet/domain/wallet';
import { WalletLedgerEntry } from '@/modules/wallet/domain/wallet-ledger-entry';

import type { IIdGenerator } from '@/shared/ports/id-generator.port';
import { SHARED_TOKENS } from '@/shared/shared.tokens';

import { WagerTransactionPendingReference } from '../../domain/events/wager-transaction-pending-reference.event';
import { WagerTransactionProcessed } from '../../domain/events/wager-transaction-processed.event';
import { WagerTransactionRejected } from '../../domain/events/wager-transaction-rejected.event';
import { WagerTransaction, WagerTransactionStatus } from '../../domain/wager-transaction';

@Injectable()
export class WageringOutboxService {
	constructor(
		@Inject(OUTBOX_TOKENS.REPOSITORY)
		private readonly outboxRepository: IOutboxRepository,

		@Inject(SHARED_TOKENS.ID_GENERATOR)
		private readonly idGenerator: IIdGenerator,

		@Optional()
		private readonly requestContextService?: RequestContextService
	) {}

	async enqueue(transaction: WagerTransaction, wallet?: Wallet, ledgerEntry?: WalletLedgerEntry): Promise<void> {
		const correlationId = this.requestContextService?.getCorrelationId() ?? transaction.id;
		const causationId = this.requestContextService?.getCausationId();

		if (transaction.status === WagerTransactionStatus.Processed) {
			const processedEvent = new WagerTransactionProcessed({
				eventId: this.idGenerator.generate(),
				aggregateId: transaction.id,
				correlationId,
				causationId,
				occurredAt: transaction.processedAt ?? new Date(),
				data: {
					transactionId: transaction.id,
					providerId: transaction.providerId,
					externalTransactionId: transaction.externalTransactionId,
					playerId: transaction.playerId,
					walletId: transaction.walletId,
					roundId: transaction.roundId,
					gameId: transaction.gameId,
					kind: transaction.kind,
					money: transaction.money.toJSON(),
					referenceExternalTransactionId: transaction.referenceExternalTransactionId,
					referenceTransactionId: transaction.referenceTransactionId
				}
			});

			await this.outboxRepository.create(OutboxMessage.enqueue(processedEvent));

			if (ledgerEntry && wallet) {
				const balanceChangedEvent = WalletBalanceChanged.from(wallet, ledgerEntry, {
					eventId: this.idGenerator.generate(),
					correlationId,
					causationId: transaction.id
				});

				await this.outboxRepository.create(OutboxMessage.enqueue(balanceChangedEvent));
			}
		} else if (transaction.status === WagerTransactionStatus.Rejected) {
			const rejectedEvent = new WagerTransactionRejected({
				eventId: this.idGenerator.generate(),
				aggregateId: transaction.id,
				correlationId,
				causationId,
				occurredAt: transaction.processedAt ?? new Date(),
				data: {
					transactionId: transaction.id,
					providerId: transaction.providerId,
					externalTransactionId: transaction.externalTransactionId,
					playerId: transaction.playerId,
					walletId: transaction.walletId,
					roundId: transaction.roundId,
					gameId: transaction.gameId,
					kind: transaction.kind,
					money: transaction.money.toJSON(),
					failureCode: transaction.failureCode ?? 'INSUFFICIENT_FUNDS',
					referenceExternalTransactionId: transaction.referenceExternalTransactionId
				}
			});

			await this.outboxRepository.create(OutboxMessage.enqueue(rejectedEvent));
		} else if (transaction.status === WagerTransactionStatus.PendingReference) {
			const pendingEvent = new WagerTransactionPendingReference({
				eventId: this.idGenerator.generate(),
				aggregateId: transaction.id,
				correlationId,
				causationId,
				occurredAt: transaction.createdAt,
				data: {
					transactionId: transaction.id,
					providerId: transaction.providerId,
					externalTransactionId: transaction.externalTransactionId,
					playerId: transaction.playerId,
					walletId: transaction.walletId,
					roundId: transaction.roundId,
					gameId: transaction.gameId,
					kind: transaction.kind,
					money: transaction.money.toJSON(),
					referenceExternalTransactionId: transaction.referenceExternalTransactionId!
				}
			});

			await this.outboxRepository.create(OutboxMessage.enqueue(pendingEvent));
		}
	}
}
