import { EntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable } from '@nestjs/common';

import { WagerTransaction, WagerTransactionKind } from '@/modules/wagering/domain/wager-transaction';
import type { IWagerTransactionRepository } from '@/modules/wagering/domain/wager-transaction.repository.interface';
import { WAGERING_TOKENS } from '@/modules/wagering/wagering.tokens';
import { Wallet } from '@/modules/wallet/domain/wallet';
import { LedgerDirection, WalletLedgerEntry } from '@/modules/wallet/domain/wallet-ledger-entry';
import { WalletAlreadyExistsError } from '@/modules/wallet/domain/wallet.errors';
import type { IWalletRepository } from '@/modules/wallet/domain/wallet.repository.interface';
import { WALLET_TOKENS } from '@/modules/wallet/wallet.tokens';

import { Money } from '@/shared/domain/money/money';
import type { IIdGenerator } from '@/shared/ports/id-generator.port';
import { SHARED_TOKENS } from '@/shared/shared.tokens';

export interface CreateWalletUseCaseInput {
	playerId: string;
	initialBalance: {
		amount: string;
		currency: string;
	};
}

export interface CreateWalletUseCaseOutput {
	id: string;
	playerId: string;
	balance: {
		amount: string;
		currency: string;
	};
	version: number;
}

@Injectable()
export class CreateWalletUseCase {
	constructor(
		@Inject(WALLET_TOKENS.REPOSITORY)
		private readonly walletRepository: IWalletRepository,
		@Inject(WAGERING_TOKENS.REPOSITORY)
		private readonly wageringRepository: IWagerTransactionRepository,

		@Inject(SHARED_TOKENS.ID_GENERATOR)
		private readonly idGenerator: IIdGenerator,

		private readonly entityManager: EntityManager
	) {}

	async execute(input: CreateWalletUseCaseInput): Promise<CreateWalletUseCaseOutput> {
		const initialMoney = Money.from(input.initialBalance);

		const existingWallet = await this.walletRepository.findByPlayerIdAndCurrency(
			input.playerId,
			initialMoney.currency
		);

		if (existingWallet) throw new WalletAlreadyExistsError(input.playerId, initialMoney.currency);

		const wallet = Wallet.open({
			id: this.idGenerator.generate(),
			playerId: input.playerId,
			initialBalance: initialMoney
		});

		if (initialMoney.isPositive()) {
			const openingTransactionId = this.idGenerator.generate();

			const ledgerEntry = WalletLedgerEntry.create({
				id: this.idGenerator.generate(),
				walletId: wallet.id,
				transactionId: openingTransactionId,
				direction: LedgerDirection.Credit,
				money: initialMoney,
				balanceBefore: Money.zero(initialMoney.currency),
				balanceAfter: initialMoney,
				createdAt: wallet.createdAt
			});

			const openingTransaction = WagerTransaction.create({
				id: openingTransactionId,
				providerId: 'internal',
				externalTransactionId: `opening-${wallet.id}`,
				idempotencyKey: `opening:${wallet.id}`,
				payloadHash: 'internal-opening-balance',
				walletId: wallet.id,
				playerId: wallet.playerId,
				roundId: 'opening',
				gameId: 'internal',
				kind: WagerTransactionKind.Opening,
				money: initialMoney,
				createdAt: wallet.createdAt
			});

			openingTransaction.markProcessed(undefined, wallet.createdAt);

			await this.entityManager.transactional(async () => {
				await this.walletRepository.create(wallet, ledgerEntry);
				await this.wageringRepository.create(openingTransaction);
			});
		} else {
			await this.walletRepository.create(wallet);
		}

		return {
			id: wallet.id,
			playerId: wallet.playerId,
			balance: wallet.balance.toJSON(),
			version: wallet.version
		};
	}
}
