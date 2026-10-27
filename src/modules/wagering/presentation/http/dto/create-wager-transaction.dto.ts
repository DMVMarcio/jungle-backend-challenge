import { z } from 'zod';

import { WagerTransaction, WagerTransactionKind } from '@/modules/wagering/domain/wager-transaction';

import { moneySchema } from '@/shared/presentation/http/dto/money.dto';

export const externalWagerKindSchema = z.enum([
	WagerTransactionKind.Bet,
	WagerTransactionKind.Win,
	WagerTransactionKind.Loss,
	WagerTransactionKind.Refund,
	WagerTransactionKind.Rollback
]);

export const createWagerTransactionSchema = z
	.object({
		providerId: z.string().trim().min(1, 'providerId is required'),
		externalTransactionId: z.string().trim().min(1, 'externalTransactionId is required'),
		playerId: z.uuid(),
		walletId: z.uuid(),
		roundId: z.string().trim().min(1, 'roundId is required'),
		gameId: z.string().trim().min(1, 'gameId is required'),
		kind: externalWagerKindSchema,
		money: moneySchema,
		referenceExternalTransactionId: z.string().trim().min(1).optional()
	})
	.refine(
		data => {
			if (WagerTransaction.requiresReference(data.kind))
				return (
					typeof data.referenceExternalTransactionId === 'string' &&
					data.referenceExternalTransactionId.length > 0
				);

			return true;
		},
		{
			message: 'referenceExternalTransactionId is required for this operation kind',
			path: ['referenceExternalTransactionId']
		}
	);

export type CreateWagerTransactionDto = z.infer<typeof createWagerTransactionSchema>;
