import z from 'zod';

export const databaseSchema = z.object({
	url: z.url(),
	poolMin: z.coerce.number().default(2),
	poolMax: z.coerce.number().default(10)
});

export type DatabaseSettings = z.infer<typeof databaseSchema>;
