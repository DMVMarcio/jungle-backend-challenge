import { WalletLedgerEntry } from './wallet-ledger-entry';

export interface FindLedgerEntriesInput {
	walletId: string;
	cursor?: string;
	limit: number;
}

export interface PaginatedLedgerEntries {
	items: WalletLedgerEntry[];
	nextCursor: string | null;
}

export interface IWalletLedgerEntryRepository {
	findPaginated(input: FindLedgerEntriesInput): Promise<PaginatedLedgerEntries>;
	findAllByWalletId(walletId: string): Promise<WalletLedgerEntry[]>;
	findByTransactionId(transactionId: string): Promise<WalletLedgerEntry | null>;

	create(entry: WalletLedgerEntry): Promise<void>;
}
