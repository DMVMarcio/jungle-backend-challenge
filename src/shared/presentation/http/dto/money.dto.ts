import z from 'zod';

export const moneyAmountSchema = z
	.string()
	.regex(/^\d+\.\d{2}$/, 'must be a positive decimal string with 2 fixed decimal places');

export const currencySchema = z
	.string()
	.trim()
	.toUpperCase()
	.regex(/^[A-Z]{3}$/, 'must be a 3-letter ISO-4217 code');

export const moneySchema = z.object({
	amount: moneyAmountSchema,
	currency: currencySchema
});

export type MoneyDto = z.infer<typeof moneySchema>;
