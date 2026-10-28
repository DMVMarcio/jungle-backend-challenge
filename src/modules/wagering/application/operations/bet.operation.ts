import { Injectable } from '@nestjs/common';

import { Wallet } from '@/modules/wallet/domain/wallet';
import { WalletLedgerEntry } from '@/modules/wallet/domain/wallet-ledger-entry';
import { WagerTransaction } from '../../domain/wager-transaction';
import { IWageringOperation } from './wagering-operation.interface';

@Injectable()
export class BetOperation implements IWageringOperation {
	async execute(wallet: Wallet, transaction: WagerTransaction): Promise<WalletLedgerEntry | undefined> {
		if (wallet.balance.isLessThan(transaction.money)) {
			transaction.reject('INSUFFICIENT_FUNDS');
			return undefined;
		}

		const entry = wallet.debit(transaction.money, transaction.id);
		transaction.markProcessed();
		return entry;
	}
}
