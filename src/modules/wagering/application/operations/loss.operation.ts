import { Injectable } from '@nestjs/common';

import { Wallet } from '@/modules/wallet/domain/wallet';
import { WalletLedgerEntry } from '@/modules/wallet/domain/wallet-ledger-entry';
import { WagerTransaction } from '../../domain/wager-transaction';
import { IWageringOperation } from './wagering-operation.interface';

@Injectable()
export class LossOperation implements IWageringOperation {
	async execute(_wallet: Wallet, transaction: WagerTransaction): Promise<WalletLedgerEntry | undefined> {
		transaction.markProcessed();
		return undefined;
	}
}
