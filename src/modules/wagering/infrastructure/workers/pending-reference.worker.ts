import { EntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';

import { MetricsService } from '@/core/observability/services/metrics.service';
import { settings } from '@/core/settings';

import type { IWalletLedgerEntryRepository } from '@/modules/wallet/domain/wallet-ledger-entry.repository.interface';
import type { IWalletRepository } from '@/modules/wallet/domain/wallet.repository.interface';
import { WALLET_TOKENS } from '@/modules/wallet/wallet.tokens';

import { RefundOperation } from '../../application/operations/refund.operation';
import { RollbackOperation } from '../../application/operations/rollback.operation';
import type { IWageringOperation } from '../../application/operations/wagering-operation.interface';
import { WageringOutboxService } from '../../application/services/wagering-outbox.service';
import { WagerTransaction, WagerTransactionKind, WagerTransactionStatus } from '../../domain/wager-transaction';
import type { IWagerTransactionRepository } from '../../domain/wager-transaction.repository.interface';
import { WAGERING_TOKENS } from '../../wagering.tokens';

@Injectable()
export class PendingReferenceWorker implements OnApplicationBootstrap, OnApplicationShutdown {
	private readonly logger = new Logger(PendingReferenceWorker.name);
	private timer?: NodeJS.Timeout;
	private isProcessing = false;
	private isRunning = false;

	private readonly operations: Partial<Record<WagerTransactionKind, IWageringOperation>>;

	constructor(
		@Inject(WAGERING_TOKENS.REPOSITORY)
		private readonly wageringRepository: IWagerTransactionRepository,

		@Inject(WALLET_TOKENS.REPOSITORY)
		private readonly walletRepository: IWalletRepository,

		@Inject(WALLET_TOKENS.LEDGER_REPOSITORY)
		private readonly ledgerRepository: IWalletLedgerEntryRepository,

		private readonly outboxService: WageringOutboxService,
		private readonly refundOperation: RefundOperation,
		private readonly rollbackOperation: RollbackOperation,
		private readonly entityManager: EntityManager,
		private readonly metricsService: MetricsService
	) {
		this.operations = {
			[WagerTransactionKind.Refund]: this.refundOperation,
			[WagerTransactionKind.Rollback]: this.rollbackOperation
		};
	}

	onApplicationBootstrap(): void {
		if (settings.nodeEnv === 'test') return;

		this.start();
	}

	onApplicationShutdown(): void {
		this.stop();
	}

	start(intervalMs = 5000): void {
		if (this.isRunning) return;
		this.isRunning = true;

		this.timer = setInterval(() => {
			this.processPendingReferences().catch(err => {
				this.logger.error(
					`Unexpected error during pending reference resolution cycle: ${(err as Error).message}`,
					(err as Error).stack
				);
			});
		}, intervalMs);
	}

	stop(): void {
		this.isRunning = false;

		if (this.timer) {
			clearInterval(this.timer);
			this.timer = undefined;
		}
	}

	async processPendingReferences(batchSize = 50, now: Date = new Date(), ttl = 300000): Promise<number> {
		if (this.isProcessing) return 0;
		this.isProcessing = true;

		try {
			const pendingTransactions = await this.wageringRepository.findPendingReferences(batchSize);
			if (pendingTransactions.length === 0) return 0;

			let resolvedCount = 0;

			for (const transaction of pendingTransactions) {
				try {
					const resolved = await this.resolvePendingTransaction(transaction, now, ttl);
					if (resolved) resolvedCount++;
				} catch (error) {
					this.entityManager.clear?.();
					this.logger.error(
						`Failed to reprocess pending transaction ${transaction.id}: ${(error as Error).message}`,
						(error as Error).stack,
						{
							transactionId: transaction.id,
							walletId: transaction.walletId,
							providerId: transaction.providerId
						}
					);
				}
			}

			return resolvedCount;
		} finally {
			this.isProcessing = false;
		}
	}

	private async resolvePendingTransaction(transaction: WagerTransaction, now: Date, ttlMs: number): Promise<boolean> {
		return this.entityManager.transactional(async () => {
			const currentTransaction = await this.wageringRepository.findById(transaction.id);
			if (!currentTransaction || currentTransaction.status !== WagerTransactionStatus.PendingReference)
				return false;

			const wallet = await this.walletRepository.findByIdWithLock(currentTransaction.walletId);
			if (!wallet) {
				currentTransaction.reject('REFERENCE_NOT_FOUND');
				await this.wageringRepository.update(currentTransaction);
				this.metricsService.recordTransaction(currentTransaction.status);
				return true;
			}

			const ageMs = now.getTime() - currentTransaction.createdAt.getTime();
			const isExpired = ageMs >= ttlMs;

			if (isExpired) {
				const reference = await this.wageringRepository.findByProviderAndExternalId(
					currentTransaction.providerId,
					currentTransaction.referenceExternalTransactionId!
				);

				if (!reference) {
					currentTransaction.reject('REFERENCE_NOT_FOUND');
					await this.wageringRepository.update(currentTransaction);
					await this.outboxService.enqueue(currentTransaction, wallet.id, wallet.balance);
					this.metricsService.recordTransaction(currentTransaction.status);
					return true;
				}
			}

			const operation = this.operations[currentTransaction.kind];
			if (!operation) return false;

			const ledgerEntry = await operation.execute(wallet, currentTransaction);

			if (currentTransaction.status === WagerTransactionStatus.PendingReference) {
				this.metricsService.recordRetry('pending_reference');
				return false;
			}

			if (ledgerEntry) {
				await this.walletRepository.update(wallet);
				await this.ledgerRepository.create(ledgerEntry);
			}

			await this.wageringRepository.update(currentTransaction);
			await this.outboxService.enqueue(currentTransaction, wallet.id, wallet.balance);
			this.metricsService.recordTransaction(currentTransaction.status);

			this.logger.log(`Pending reference resolved for transaction ${currentTransaction.id}`, {
				transactionId: currentTransaction.id,
				walletId: currentTransaction.walletId,
				providerId: currentTransaction.providerId
			});

			return true;
		});
	}
}
