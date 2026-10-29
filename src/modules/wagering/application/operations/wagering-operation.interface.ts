import { Wallet } from '@/modules/wallet/domain/wallet';
import { WalletLedgerEntry } from '@/modules/wallet/domain/wallet-ledger-entry';

import { WagerTransaction } from '../../domain/wager-transaction';

export interface IWageringOperation {
	execute(wallet: Wallet, transaction: WagerTransaction): Promise<WalletLedgerEntry | undefined>;
}
