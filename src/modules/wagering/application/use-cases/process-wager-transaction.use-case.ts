import { EntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable, Optional } from '@nestjs/common';

import { InboxMessage } from '@/modules/inbox/domain/inbox-message';
import type { IInboxRepository } from '@/modules/inbox/domain/inbox.repository.interface';
import { INBOX_TOKENS } from '@/modules/inbox/inbox.tokens';
import {
	FailureCode,
	WagerTransaction,
	WagerTransactionKind,
	WagerTransactionStatus
} from '@/modules/wagering/domain/wager-transaction';
import type { IWagerTransactionRepository } from '@/modules/wagering/domain/wager-transaction.repository.interface';
import { IdempotencyConflictError } from '@/modules/wagering/domain/wagering.errors';
import { WAGERING_TOKENS } from '@/modules/wagering/wagering.tokens';
import { Wallet } from '@/modules/wallet/domain/wallet';
import { WalletLedgerEntry } from '@/modules/wallet/domain/wallet-ledger-entry';
import type { IWalletLedgerEntryRepository } from '@/modules/wallet/domain/wallet-ledger-entry.repository.interface';
import { WalletNotFoundError, WalletOwnershipError } from '@/modules/wallet/domain/wallet.errors';
import type { IWalletRepository } from '@/modules/wallet/domain/wallet.repository.interface';
import { WALLET_TOKENS } from '@/modules/wallet/wallet.tokens';

import { Money } from '@/shared/domain/money/money';
import { CurrencyMismatchError } from '@/shared/domain/money/money.errors';
import type { IIdGenerator } from '@/shared/ports/id-generator.port';
import type { IPayloadHasher } from '@/shared/ports/payload-hasher.port';
import { SHARED_TOKENS } from '@/shared/shared.tokens';

import { BetOperation } from '../operations/bet.operation';
import { LossOperation } from '../operations/loss.operation';
import { RefundOperation } from '../operations/refund.operation';
import { RollbackOperation } from '../operations/rollback.operation';
import type { IWageringOperation } from '../operations/wagering-operation.interface';
import { WinOperation } from '../operations/win.operation';
import { WageringOutboxService } from '../services/wagering-outbox.service';

export interface ProcessWagerTransactionInput {
	idempotencyKey: string;
	providerId: string;
	externalTransactionId: string;
	playerId: string;
	walletId: string;
	roundId: string;
	gameId: string;
	kind: WagerTransactionKind;
	money: {
		amount: string;
		currency: string;
	};
	referenceExternalTransactionId?: string;
	inboxMessage?: {
		messageId: string;
		consumerName: string;
	};
}

export interface ProcessWagerTransactionOutput {
	transactionId: string;
	status: WagerTransactionStatus;
	failureCode?: FailureCode;
	balance: {
		amount: string;
		currency: string;
	};
	idempotentReplay: boolean;
}

@Injectable()
export class ProcessWagerTransactionUseCase {
	private readonly operations: Record<WagerTransactionKind, IWageringOperation | undefined>;

	constructor(
		@Inject(WAGERING_TOKENS.REPOSITORY)
		private readonly wageringRepository: IWagerTransactionRepository,

		@Inject(WALLET_TOKENS.REPOSITORY)
		private readonly walletRepository: IWalletRepository,

		@Inject(WALLET_TOKENS.LEDGER_REPOSITORY)
		private readonly ledgerRepository: IWalletLedgerEntryRepository,

		@Inject(SHARED_TOKENS.ID_GENERATOR)
		private readonly idGenerator: IIdGenerator,

		@Inject(SHARED_TOKENS.PAYLOAD_HASHER)
		private readonly payloadHasher: IPayloadHasher,

		private readonly outboxService: WageringOutboxService,
		private readonly betOperation: BetOperation,
		private readonly winOperation: WinOperation,
		private readonly lossOperation: LossOperation,
		private readonly refundOperation: RefundOperation,
		private readonly rollbackOperation: RollbackOperation,
		private readonly entityManager: EntityManager,

		@Optional()
		@Inject(INBOX_TOKENS.REPOSITORY)
		private readonly inboxRepository?: IInboxRepository
	) {
		this.operations = {
			[WagerTransactionKind.Bet]: this.betOperation,
			[WagerTransactionKind.Win]: this.winOperation,
			[WagerTransactionKind.Loss]: this.lossOperation,
			[WagerTransactionKind.Refund]: this.refundOperation,
			[WagerTransactionKind.Rollback]: this.rollbackOperation,
			[WagerTransactionKind.Opening]: undefined
		};
	}

	async execute(input: ProcessWagerTransactionInput): Promise<ProcessWagerTransactionOutput> {
		const money = Money.from(input.money);
		const payloadHash = this.computePayloadHash(input, money);

		const existingTransaction = await this.wageringRepository.findByIdempotencyKey(input.idempotencyKey);
		if (existingTransaction) return this.handleIdempotentReplay(existingTransaction, payloadHash, money);

		const existingByExternal = await this.assertNoDuplicateExternalTransaction(
			input.providerId,
			input.externalTransactionId,
			input.idempotencyKey
		);
		if (existingByExternal) return this.handleIdempotentReplay(existingByExternal, payloadHash, money);

		try {
			return await this.entityManager.transactional(async () => {
				const existingInside = await this.wageringRepository.findByIdempotencyKey(input.idempotencyKey);
				if (existingInside) return this.handleIdempotentReplay(existingInside, payloadHash, money);

				const wallet = await this.loadAndValidateWallet(input.walletId, input.playerId, money.currency);
				const transaction = this.createTransaction(input, money, payloadHash);

				const ledgerEntry = await this.applyOperation(wallet, transaction);

				if (ledgerEntry) {
					await this.walletRepository.update(wallet);
					await this.ledgerRepository.create(ledgerEntry);
				}

				await this.wageringRepository.create(transaction);
				await this.outboxService.enqueue(transaction, wallet.id, wallet.balance);

				if (input.inboxMessage && this.inboxRepository) {
					const inbox = InboxMessage.receive({
						messageId: input.inboxMessage.messageId,
						consumerName: input.inboxMessage.consumerName,
						payloadHash
					});

					inbox.markProcessed();
					await this.inboxRepository.create(inbox);
				}

				return {
					transactionId: transaction.id,
					status: transaction.status,
					failureCode: transaction.failureCode,
					balance: wallet.balance.toJSON(),
					idempotentReplay: false
				};
			});
		} catch (error) {
			this.entityManager.clear?.();

			const databaseException = error as { code?: string; name?: string } | null | undefined;
			const isUniqueViolation =
				databaseException?.code === '23505' ||
				databaseException?.name === 'UniqueConstraintViolationException';

			if (isUniqueViolation) {
				const concurrentTransaction = await this.wageringRepository.findByIdempotencyKey(input.idempotencyKey);
				if (concurrentTransaction) {
					return this.handleIdempotentReplay(concurrentTransaction, payloadHash, money);
				}
			}

			throw error;
		}
	}

	private computePayloadHash(input: ProcessWagerTransactionInput, money: Money): string {
		return this.payloadHasher.hash({
			providerId: input.providerId,
			externalTransactionId: input.externalTransactionId,
			playerId: input.playerId,
			walletId: input.walletId,
			roundId: input.roundId,
			gameId: input.gameId,
			kind: input.kind,
			money: {
				amount: money.toJSON().amount,
				currency: money.toJSON().currency
			},
			referenceExternalTransactionId: input.referenceExternalTransactionId ?? null
		});
	}

	private async handleIdempotentReplay(
		existingTransaction: WagerTransaction,
		payloadHash: string,
		fallbackMoney: Money
	): Promise<ProcessWagerTransactionOutput> {
		if (!existingTransaction.matchesPayload(payloadHash)) {
			throw new IdempotencyConflictError(existingTransaction.idempotencyKey);
		}

		let replayBalance: { amount: string; currency: string };
		const ledgerEntry = await this.ledgerRepository.findByTransactionId(existingTransaction.id);

		if (ledgerEntry) {
			replayBalance = ledgerEntry.balanceAfter.toJSON();
		} else {
			const wallet = await this.walletRepository.findById(existingTransaction.walletId);
			replayBalance = wallet ? wallet.balance.toJSON() : fallbackMoney.toJSON();
		}

		return {
			transactionId: existingTransaction.id,
			status: existingTransaction.status,
			failureCode: existingTransaction.failureCode,
			balance: replayBalance,
			idempotentReplay: true
		};
	}

	private async assertNoDuplicateExternalTransaction(
		providerId: string,
		externalTransactionId: string,
		idempotencyKey: string
	): Promise<WagerTransaction | null> {
		const existing = await this.wageringRepository.findByProviderAndExternalId(providerId, externalTransactionId);
		if (existing) {
			if (existing.idempotencyKey !== idempotencyKey) {
				throw new IdempotencyConflictError(idempotencyKey);
			}
			return existing;
		}
		return null;
	}

	private async loadAndValidateWallet(walletId: string, playerId: string, expectedCurrency: string): Promise<Wallet> {
		const wallet = await this.walletRepository.findByIdWithLock(walletId);
		if (!wallet) throw new WalletNotFoundError(walletId);
		if (wallet.playerId !== playerId) throw new WalletOwnershipError(walletId, playerId);
		if (wallet.currency !== expectedCurrency) throw new CurrencyMismatchError(wallet.currency, expectedCurrency);

		return wallet;
	}

	private createTransaction(
		input: ProcessWagerTransactionInput,
		money: Money,
		payloadHash: string
	): WagerTransaction {
		return WagerTransaction.create({
			id: this.idGenerator.generate(),
			providerId: input.providerId,
			externalTransactionId: input.externalTransactionId,
			idempotencyKey: input.idempotencyKey,
			payloadHash,
			walletId: input.walletId,
			playerId: input.playerId,
			roundId: input.roundId,
			gameId: input.gameId,
			kind: input.kind,
			money,
			referenceExternalTransactionId: input.referenceExternalTransactionId
		});
	}

	private async applyOperation(
		wallet: Wallet,
		transaction: WagerTransaction
	): Promise<WalletLedgerEntry | undefined> {
		const handler = this.operations[transaction.kind];
		if (!handler) return undefined;

		return handler.execute(wallet, transaction);
	}
}
