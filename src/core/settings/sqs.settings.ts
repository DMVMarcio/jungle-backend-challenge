import z from 'zod';

export const sqsSchema = z.object({
	region: z.string().default('us-east-1'),
	endpoint: z.url().default('http://localhost:4566'),
	accessKeyId: z.string().default('test'),
	secretAccessKey: z.string().default('test'),

	queues: z.object({
		wagerTransactions: z.url(),
		wagerTransactionsDlq: z.url(),
		wagerEvents: z.url().default('http://localhost:4566/000000000000/wager-events.fifo')
	})
});

export type SQSSettings = z.infer<typeof sqsSchema>;
