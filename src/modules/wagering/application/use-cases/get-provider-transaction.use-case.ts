import { Inject, Injectable } from '@nestjs/common';

import type { IWagerTransactionRepository } from '@/modules/wagering/domain/wager-transaction.repository.interface';
import { WagerTransactionNotFoundError } from '@/modules/wagering/domain/wagering.errors';
import { WAGERING_TOKENS } from '@/modules/wagering/wagering.tokens';

import type { WagerTransactionOutput } from './get-wager-transaction.use-case';

export interface GetProviderTransactionInput {
	providerId: string;
	externalTransactionId: string;
}

@Injectable()
export class GetProviderTransactionUseCase {
	constructor(
		@Inject(WAGERING_TOKENS.REPOSITORY)
		private readonly wageringRepository: IWagerTransactionRepository
	) {}

	async execute(input: GetProviderTransactionInput): Promise<WagerTransactionOutput> {
		const transaction = await this.wageringRepository.findByProviderAndExternalId(
			input.providerId,
			input.externalTransactionId
		);
		if (!transaction) throw new WagerTransactionNotFoundError(`${input.providerId}:${input.externalTransactionId}`);

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
