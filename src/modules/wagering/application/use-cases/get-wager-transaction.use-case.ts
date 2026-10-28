import { Inject, Injectable } from '@nestjs/common';

import type { IWagerTransactionRepository } from '@/modules/wagering/domain/wager-transaction.repository.interface';
import { WagerTransactionNotFoundError } from '@/modules/wagering/domain/wagering.errors';
import { WAGERING_TOKENS } from '@/modules/wagering/wagering.tokens';

export interface GetWagerTransactionInput {
	transactionId: string;
}

export interface WagerTransactionOutput {
	id: string;
	providerId: string;
	externalTransactionId: string;
	idempotencyKey: string;
	walletId: string;
	playerId: string;
	roundId: string;
	gameId: string;
	kind: string;
	money: {
		amount: string;
		currency: string;
	};
	referenceExternalTransactionId?: string;
	referenceTransactionId?: string;
	status: string;
	failureCode?: string;
	createdAt: Date;
	processedAt?: Date;
}

@Injectable()
export class GetWagerTransactionUseCase {
	constructor(
		@Inject(WAGERING_TOKENS.REPOSITORY)
		private readonly wageringRepository: IWagerTransactionRepository
	) {}

	async execute(input: GetWagerTransactionInput): Promise<WagerTransactionOutput> {
		const transaction = await this.wageringRepository.findById(input.transactionId);
		if (!transaction) throw new WagerTransactionNotFoundError(input.transactionId);

		return {
			id: transaction.id,
			providerId: transaction.providerId,
			externalTransactionId: transaction.externalTransactionId,
			idempotencyKey: transaction.idempotencyKey,
			walletId: transaction.walletId,
			playerId: transaction.playerId,
			roundId: transaction.roundId,
			gameId: transaction.gameId,
			kind: transaction.kind,
			money: transaction.money.toJSON(),
			referenceExternalTransactionId: transaction.referenceExternalTransactionId,
			referenceTransactionId: transaction.referenceTransactionId,
			status: transaction.status,
			failureCode: transaction.failureCode,
			createdAt: transaction.createdAt,
			processedAt: transaction.processedAt
		};
	}
}
