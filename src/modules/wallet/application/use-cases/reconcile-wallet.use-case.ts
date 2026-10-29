import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

import { MetricsService } from '@/core/observability/services/metrics.service';

import type { IWalletLedgerEntryRepository } from '@/modules/wallet/domain/wallet-ledger-entry.repository.interface';
import type { IWalletRepository } from '@/modules/wallet/domain/wallet.repository.interface';
import { WALLET_TOKENS } from '@/modules/wallet/wallet.tokens';

import { Money } from '@/shared/domain/money/money';

import { LedgerDirection } from '../../domain/wallet-ledger-entry';
import { WalletNotFoundError } from '../../domain/wallet.errors';

export interface ReconcileWalletUseCaseInput {
	walletId: string;
}

export interface ReconcileWalletUseCaseOutput {
	walletId: string;
	storedBalance: {
		amount: string;
		currency: string;
	};
	calculatedBalance: {
		amount: string;
		currency: string;
	};
	difference: {
		amount: string;
		currency: string;
	};
	consistent: boolean;
	checkedEntries: number;
}

@Injectable()
export class ReconcileWalletUseCase {
	private readonly logger = new Logger(ReconcileWalletUseCase.name);

	constructor(
		@Inject(WALLET_TOKENS.REPOSITORY)
		private readonly walletRepository: IWalletRepository,
		@Inject(WALLET_TOKENS.LEDGER_REPOSITORY)
		private readonly ledgerRepository: IWalletLedgerEntryRepository,
		@Optional()
		private readonly metricsService?: MetricsService
	) {}

	async execute(input: ReconcileWalletUseCaseInput): Promise<ReconcileWalletUseCaseOutput> {
		const wallet = await this.walletRepository.findById(input.walletId);
		if (!wallet) throw new WalletNotFoundError(input.walletId);

		const entries = await this.ledgerRepository.findAllByWalletId(input.walletId);

		let calculated = Money.zero(wallet.currency);
		for (const entry of entries) {
			if (entry.direction === LedgerDirection.Credit) {
				calculated = calculated.add(entry.money);
			} else {
				calculated = calculated.subtract(entry.money);
			}
		}

		const storedBalance = wallet.balance;
		const difference = storedBalance.subtract(calculated);
		const consistent = difference.isZero();

		if (!consistent) {
			this.metricsService?.recordReconciliationDiscrepancy();
			this.logger.warn(`Wallet reconciliation discrepancy detected`, {
				walletId: wallet.id,
				storedBalance: storedBalance.toString(),
				calculatedBalance: calculated.toString(),
				difference: difference.toString()
			});
		}

		return {
			walletId: wallet.id,
			storedBalance: storedBalance.toJSON(),
			calculatedBalance: calculated.toJSON(),
			difference: difference.toJSON(),
			consistent,
			checkedEntries: entries.length
		};
	}
}
