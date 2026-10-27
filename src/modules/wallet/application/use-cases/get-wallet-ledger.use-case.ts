import { Inject, Injectable } from '@nestjs/common';

import type { IWalletRepository } from '@/modules/wallet/domain/wallet.repository.interface';
import type { IWalletLedgerEntryRepository } from '@/modules/wallet/domain/wallet-ledger-entry.repository.interface';
import { WALLET_TOKENS } from '@/modules/wallet/wallet.tokens';

import { WalletNotFoundError } from '../../domain/wallet.errors';

export interface GetWalletLedgerUseCaseInput {
	walletId: string;
	cursor?: string;
	limit?: number;
}

export interface WalletLedgerItemOutput {
	id: string;
	walletId: string;
	transactionId: string;
	direction: string;
	amount: {
		amount: string;
		currency: string;
	};
	balanceBefore: {
		amount: string;
		currency: string;
	};
	balanceAfter: {
		amount: string;
		currency: string;
	};
	createdAt: string;
}

export interface GetWalletLedgerUseCaseOutput {
	items: WalletLedgerItemOutput[];
	nextCursor: string | null;
}

@Injectable()
export class GetWalletLedgerUseCase {
	constructor(
		@Inject(WALLET_TOKENS.REPOSITORY)
		private readonly walletRepository: IWalletRepository,
		@Inject(WALLET_TOKENS.LEDGER_REPOSITORY)
		private readonly ledgerRepository: IWalletLedgerEntryRepository
	) {}

	async execute(input: GetWalletLedgerUseCaseInput): Promise<GetWalletLedgerUseCaseOutput> {
		const wallet = await this.walletRepository.findById(input.walletId);
		if (!wallet) throw new WalletNotFoundError(input.walletId);

		const paginated = await this.ledgerRepository.findPaginated({
			walletId: input.walletId,
			cursor: input.cursor,
			limit: input.limit ?? 50
		});

		return {
			items: paginated.items.map(entry => ({
				id: entry.id,
				walletId: entry.walletId,
				transactionId: entry.transactionId,
				direction: entry.direction,
				amount: entry.money.toJSON(),
				balanceBefore: entry.balanceBefore.toJSON(),
				balanceAfter: entry.balanceAfter.toJSON(),
				createdAt: entry.createdAt.toISOString()
			})),
			nextCursor: paginated.nextCursor
		};
	}
}
