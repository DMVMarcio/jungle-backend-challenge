import { Inject, Injectable } from '@nestjs/common';

import { Wallet } from '@/modules/wallet/domain/wallet';
import { WalletLedgerEntry } from '@/modules/wallet/domain/wallet-ledger-entry';

import { WagerTransaction } from '../../domain/wager-transaction';
import type { IWagerTransactionRepository } from '../../domain/wager-transaction.repository.interface';
import { WAGERING_TOKENS } from '../../wagering.tokens';
import { IWageringOperation } from './wagering-operation.interface';

@Injectable()
export class RefundOperation implements IWageringOperation {
	constructor(
		@Inject(WAGERING_TOKENS.REPOSITORY)
		private readonly wageringRepository: IWagerTransactionRepository
	) {}

	async execute(wallet: Wallet, transaction: WagerTransaction): Promise<WalletLedgerEntry | undefined> {
		const referenceTransaction = await this.wageringRepository.findByProviderAndExternalId(
			transaction.providerId,
			transaction.referenceExternalTransactionId!
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

		const alreadyReversed = await this.wageringRepository.findProcessedByReferenceId(referenceTransaction.id);
		if (alreadyReversed) {
			transaction.reject('REFERENCE_ALREADY_REVERSED');
			return undefined;
		}

		const entry = wallet.credit(transaction.money, transaction.id);
		transaction.markProcessed(referenceTransaction.id);
		return entry;
	}
}
