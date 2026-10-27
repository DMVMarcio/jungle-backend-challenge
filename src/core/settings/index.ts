import z from 'zod';

import { databaseSchema } from './database.settings';
import { serverSchema } from './server.settings';
import { sqsSchema } from './sqs.settings';

export const appSettingsSchema = z.object({
	nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
	server: serverSchema,
	database: databaseSchema,
	sqs: sqsSchema
});

export const settings = appSettingsSchema.parse({
	nodeEnv: process.env.NODE_ENV,
	server: {
		port: process.env.PORT ?? process.env.SERVER_PORT,
		host: process.env.HOST ?? process.env.SERVER_HOST
	},
	database: {
		url: process.env.DATABASE_URL,
		poolMin: process.env.DATABASE_POOL_MIN,
		poolMax: process.env.DATABASE_POOL_MAX
	},
	sqs: {
		region: process.env.AWS_REGION,
		endpoint: process.env.AWS_ENDPOINT,
		accessKeyId: process.env.AWS_ACCESS_KEY_ID,
		secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
		queues: {
			wagerTransactions: process.env.SQS_WAGER_QUEUE_URL,
			wagerTransactionsDlq: process.env.SQS_WAGER_DLQ_URL
		}
	}
});

export type Settings = z.infer<typeof appSettingsSchema>;
