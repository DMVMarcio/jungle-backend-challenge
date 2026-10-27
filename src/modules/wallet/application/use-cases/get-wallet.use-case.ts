import { Inject, Injectable } from '@nestjs/common';

import type { IWalletRepository } from '@/modules/wallet/domain/wallet.repository.interface';
import { WALLET_TOKENS } from '@/modules/wallet/wallet.tokens';

import { WalletNotFoundError } from '../../domain/wallet.errors';

export interface GetWalletUseCaseInput {
	walletId: string;
}

export interface GetWalletUseCaseOutput {
	id: string;
	playerId: string;
	balance: {
		amount: string;
		currency: string;
	};
	version: number;
}

@Injectable()
export class GetWalletUseCase {
	constructor(
		@Inject(WALLET_TOKENS.REPOSITORY)
		private readonly walletRepository: IWalletRepository
	) {}

	async execute(input: GetWalletUseCaseInput): Promise<GetWalletUseCaseOutput> {
		const wallet = await this.walletRepository.findById(input.walletId);

		if (!wallet) throw new WalletNotFoundError(input.walletId);

		return {
			id: wallet.id,
			playerId: wallet.playerId,
			balance: wallet.balance.toJSON(),
			version: wallet.version
		};
	}
}
