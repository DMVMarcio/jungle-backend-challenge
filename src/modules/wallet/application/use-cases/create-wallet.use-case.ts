import { EntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable, Optional } from '@nestjs/common';

import { RequestContextService } from '@/core/observability/services/request-context.service';
import { OutboxMessage } from '@/modules/outbox/domain/outbox-message';
import type { IOutboxRepository } from '@/modules/outbox/domain/outbox.repository.interface';
import { OUTBOX_TOKENS } from '@/modules/outbox/outbox.tokens';
import { WagerTransactionProcessed } from '@/modules/wagering/domain/events/wager-transaction-processed.event';
import { WagerTransaction, WagerTransactionKind } from '@/modules/wagering/domain/wager-transaction';
import type { IWagerTransactionRepository } from '@/modules/wagering/domain/wager-transaction.repository.interface';
import { WageringOutboxService } from '@/modules/wagering/application/services/wagering-outbox.service';
import { WAGERING_TOKENS } from '@/modules/wagering/wagering.tokens';
import { WalletBalanceChanged } from '@/modules/wallet/domain/events/wallet-balance-changed.event';
import { Wallet } from '@/modules/wallet/domain/wallet';
import { LedgerDirection, WalletLedgerEntry } from '@/modules/wallet/domain/wallet-ledger-entry';
import type { IWalletLedgerEntryRepository } from '@/modules/wallet/domain/wallet-ledger-entry.repository.interface';
import { WalletAlreadyExistsError } from '@/modules/wallet/domain/wallet.errors';
import type { IWalletRepository } from '@/modules/wallet/domain/wallet.repository.interface';
import { WALLET_TOKENS } from '@/modules/wallet/wallet.tokens';
import { Money } from '@/shared/domain/money/money';
import type { IIdGenerator } from '@/shared/ports/id-generator.port';
import { SHARED_TOKENS } from '@/shared/shared.tokens';

export interface CreateWalletUseCaseInput {
	playerId: string;
	initialBalance: {
		amount: string;
		currency: string;
	};
}

export interface CreateWalletUseCaseOutput {
	id: string;
	playerId: string;
	balance: {
		amount: string;
		currency: string;
	};
	version: number;
}

@Injectable()
export class CreateWalletUseCase {
	constructor(
		@Inject(WALLET_TOKENS.REPOSITORY)
		private readonly walletRepository: IWalletRepository,
		@Inject(WALLET_TOKENS.LEDGER_REPOSITORY)
		private readonly ledgerRepository: IWalletLedgerEntryRepository,
		@Inject(WAGERING_TOKENS.REPOSITORY)
		private readonly wageringRepository: IWagerTransactionRepository,
		@Inject(OUTBOX_TOKENS.REPOSITORY)
		private readonly outboxRepository: IOutboxRepository,

		@Inject(SHARED_TOKENS.ID_GENERATOR)
		private readonly idGenerator: IIdGenerator,

		private readonly requestContextService: RequestContextService,
		private readonly entityManager: EntityManager,
		@Optional()
		private readonly outboxService?: WageringOutboxService
	) {}

	async execute(input: CreateWalletUseCaseInput): Promise<CreateWalletUseCaseOutput> {
		const initialMoney = Money.from(input.initialBalance);

		const existingWallet = await this.walletRepository.findByPlayerIdAndCurrency(
			input.playerId,
			initialMoney.currency
		);

		if (existingWallet) throw new WalletAlreadyExistsError(input.playerId, initialMoney.currency);

		const wallet = Wallet.open({
			id: this.idGenerator.generate(),
			playerId: input.playerId,
			initialBalance: initialMoney
		});

		try {
			if (initialMoney.isPositive()) {
				const openingTransactionId = this.idGenerator.generate();

				const ledgerEntry = WalletLedgerEntry.create({
					id: this.idGenerator.generate(),
					walletId: wallet.id,
					transactionId: openingTransactionId,
					direction: LedgerDirection.Credit,
					money: initialMoney,
					balanceBefore: Money.zero(initialMoney.currency),
					balanceAfter: initialMoney,
					createdAt: wallet.createdAt
				});

				const openingTransaction = WagerTransaction.create({
					id: openingTransactionId,
					providerId: 'internal',
					externalTransactionId: `opening-${wallet.id}`,
					idempotencyKey: `opening:${wallet.id}`,
					payloadHash: 'internal-opening-balance',
					walletId: wallet.id,
					playerId: wallet.playerId,
					roundId: 'opening',
					gameId: 'internal',
					kind: WagerTransactionKind.Opening,
					money: initialMoney,
					createdAt: wallet.createdAt
				});

				openingTransaction.markProcessed(undefined, wallet.createdAt);
				openingTransaction.recordBalanceAfter(wallet.balance);

				await this.entityManager.transactional(async () => {
					await this.walletRepository.create(wallet);
					await this.ledgerRepository.create(ledgerEntry);
					await this.wageringRepository.create(openingTransaction);

					if (this.outboxService) {
						await this.outboxService.enqueue(openingTransaction, wallet, ledgerEntry);
					} else {
						const correlationId = this.requestContextService.getCorrelationId() ?? openingTransactionId;

						const transactionProcessedEvent = new WagerTransactionProcessed({
							eventId: this.idGenerator.generate(),
							aggregateId: openingTransactionId,
							correlationId,
							causationId: openingTransactionId,
							occurredAt: wallet.createdAt,
							data: {
								transactionId: openingTransaction.id,
								providerId: openingTransaction.providerId,
								externalTransactionId: openingTransaction.externalTransactionId,
								playerId: openingTransaction.playerId,
								walletId: openingTransaction.walletId,
								roundId: openingTransaction.roundId,
								gameId: openingTransaction.gameId,
								kind: openingTransaction.kind,
								money: openingTransaction.money.toJSON()
							}
						});

						const balanceChangedEvent = WalletBalanceChanged.from(wallet, ledgerEntry, {
							eventId: this.idGenerator.generate(),
							correlationId,
							causationId: openingTransactionId
						});

						await this.outboxRepository.create(OutboxMessage.enqueue(transactionProcessedEvent));
						await this.outboxRepository.create(OutboxMessage.enqueue(balanceChangedEvent));
					}
				});
			} else {
				await this.walletRepository.create(wallet);
			}
		} catch (error) {
			this.entityManager.clear?.();
			const dbError = error as { code?: string; name?: string } | null | undefined;
			if (dbError?.code === '23505' || dbError?.name === 'UniqueConstraintViolationException') {
				throw new WalletAlreadyExistsError(input.playerId, initialMoney.currency);
			}
			throw error;
		}

		return {
			id: wallet.id,
			playerId: wallet.playerId,
			balance: wallet.balance.toJSON(),
			version: wallet.version
		};
	}
}
