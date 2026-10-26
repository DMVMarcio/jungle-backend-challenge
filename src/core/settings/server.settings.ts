import z from 'zod';

export const serverSchema = z.object({
	port: z.coerce.number().default(3000),
	host: z.string().default('0.0.0.0')
});

export type ServerSettings = z.infer<typeof serverSchema>;
