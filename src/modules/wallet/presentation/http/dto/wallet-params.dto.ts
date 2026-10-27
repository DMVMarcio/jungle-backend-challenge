import { z } from 'zod';

export const walletParamsSchema = z.object({
	walletId: z.uuid()
});

export type WalletParamsDto = z.infer<typeof walletParamsSchema>;
