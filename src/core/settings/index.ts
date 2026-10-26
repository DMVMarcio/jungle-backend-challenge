import z from 'zod';

import { serverSchema } from './server.settings';

export const appSettingsSchema = z.object({
	nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
	server: serverSchema
});

export const settings = appSettingsSchema.parse({
	nodeEnv: process.env.NODE_ENV,
	server: {
		port: process.env.PORT ?? process.env.SERVER_PORT,
		host: process.env.HOST ?? process.env.SERVER_HOST
	}
});

export type Settings = z.infer<typeof appSettingsSchema>;
