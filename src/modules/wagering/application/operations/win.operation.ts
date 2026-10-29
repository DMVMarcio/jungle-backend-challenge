import { Inject, Injectable, Optional } from '@nestjs/common';

import { Wallet } from '@/modules/wallet/domain/wallet';
import { WalletLedgerEntry } from '@/modules/wallet/domain/wallet-ledger-entry';

import { WagerTransaction } from '../../domain/wager-transaction';
import type { IWagerTransactionRepository } from '../../domain/wager-transaction.repository.interface';
import { WAGERING_TOKENS } from '../../wagering.tokens';
import { IWageringOperation } from './wagering-operation.interface';

@Injectable()
export class WinOperation implements IWageringOperation {
	constructor(
		@Optional()
		@Inject(WAGERING_TOKENS.REPOSITORY)
		private readonly wageringRepository?: IWagerTransactionRepository
	) {}

	async execute(wallet: Wallet, transaction: WagerTransaction): Promise<WalletLedgerEntry | undefined> {
		let referenceTransactionId: string | undefined;

		if (transaction.referenceExternalTransactionId && this.wageringRepository) {
			const referenceTransaction = await this.wageringRepository.findByProviderAndExternalId(
				transaction.providerId,
				transaction.referenceExternalTransactionId
			);

			if (!referenceTransaction) {
				transaction.markPendingReference();
				return undefined;
			}

			const validationError = transaction.validateReference(referenceTransaction);
			if (validationError) {
				transaction.reject(validationError);
				return undefined;
			}

			referenceTransactionId = referenceTransaction.id;
		}

		const entry = wallet.credit(transaction.money, transaction.id);
		transaction.markProcessed(referenceTransactionId);
		return entry;
	}
}
