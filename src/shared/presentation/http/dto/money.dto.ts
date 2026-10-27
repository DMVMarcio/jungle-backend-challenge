import z from 'zod';

export const moneyAmountSchema = z
	.string()
	.regex(/^\d+(\.\d{1,2})?$/, 'must be a positive decimal string with at most 2 decimal places');

export const currencySchema = z.string().length(3, 'must be a 3-letter ISO-4217 code').toUpperCase();

export const moneySchema = z.object({
	amount: moneyAmountSchema,
	currency: currencySchema
});

export type MoneyDto = z.infer<typeof moneySchema>;
