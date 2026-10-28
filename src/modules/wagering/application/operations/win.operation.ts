import { Injectable } from '@nestjs/common';

import { Wallet } from '@/modules/wallet/domain/wallet';
import { WalletLedgerEntry } from '@/modules/wallet/domain/wallet-ledger-entry';
import { WagerTransaction } from '../../domain/wager-transaction';
import { IWageringOperation } from './wagering-operation.interface';

@Injectable()
export class WinOperation implements IWageringOperation {
	async execute(wallet: Wallet, transaction: WagerTransaction): Promise<WalletLedgerEntry | undefined> {
		const entry = wallet.credit(transaction.money, transaction.id);
		transaction.markProcessed();
		return entry;
	}
}
