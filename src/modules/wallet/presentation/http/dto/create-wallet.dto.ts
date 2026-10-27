import z from 'zod';

import { moneySchema } from '@/shared/presentation/http/dto/money.dto';

export const createWalletSchema = z.object({
	playerId: z.uuid(),
	initialBalance: moneySchema
});

export type CreateWalletDto = z.infer<typeof createWalletSchema>;
