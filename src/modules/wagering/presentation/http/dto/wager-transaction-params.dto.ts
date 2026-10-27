import { z } from 'zod';

export const wagerTransactionIdParamSchema = z.object({
	transactionId: z.uuid()
});

export type WagerTransactionIdParamDto = z.infer<typeof wagerTransactionIdParamSchema>;

export const providerTransactionParamsSchema = z.object({
	providerId: z.string().trim().min(1, 'is required'),
	externalTransactionId: z.string().trim().min(1, 'is required')
});

export type ProviderTransactionParamsDto = z.infer<typeof providerTransactionParamsSchema>;
