import { CreateQueueCommand, SQSClient } from '@aws-sdk/client-sqs';
import { MikroORM } from '@mikro-orm/postgresql';
import { LocalstackContainer, type StartedLocalStackContainer } from '@testcontainers/localstack';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

import config from '../../mikro-orm.config';
import { settings } from '../../src/core/settings';

export interface TestPostgresContext {
	container: StartedPostgreSqlContainer;
	connectionUrl: string;

	stop: () => Promise<void>;
}

export interface TestLocalstackContext {
	container: StartedLocalStackContainer;
	endpoint: string;
	wagerQueueUrl: string;
	dlqQueueUrl: string;

	stop: () => Promise<void>;
}

export async function startPostgresContainer(): Promise<TestPostgresContext> {
	const container = await new PostgreSqlContainer('postgres:17-alpine')
		.withDatabase('jungle_db')
		.withUsername('jungle')
		.withPassword('jungle')
		.start();
	const connectionUrl = container.getConnectionUri();

	(settings.database as any).url = connectionUrl;

	const orm = await MikroORM.init({
		...config,
		clientUrl: connectionUrl,
		debug: false
	});

	await orm.migrator.up();
	await orm.close();

	return {
		container,
		connectionUrl,
		stop: async () => {
			await container.stop();
		}
	};
}

export async function startLocalstackContainer(): Promise<TestLocalstackContext> {
	const container = await new LocalstackContainer('localstack/localstack:3.8.1').start();
	const endpoint = container.getConnectionUri();

	const sqsClient = new SQSClient({
		region: 'us-east-1',
		endpoint,
		credentials: {
			accessKeyId: 'test',
			secretAccessKey: 'test'
		}
	});

	await sqsClient.send(
		new CreateQueueCommand({
			QueueName: 'wager-transactions.fifo',
			Attributes: {
				FifoQueue: 'true',
				ContentBasedDeduplication: 'true'
			}
		})
	);

	await sqsClient.send(
		new CreateQueueCommand({
			QueueName: 'wager-transactions-dlq.fifo',
			Attributes: {
				FifoQueue: 'true',
				ContentBasedDeduplication: 'true'
			}
		})
	);

	const wagerQueueUrl = `${endpoint}/000000000000/wager-transactions.fifo`;
	const dlqQueueUrl = `${endpoint}/000000000000/wager-transactions-dlq.fifo`;

	(settings.sqs as any).endpoint = endpoint;
	(settings.sqs.queues as any).wagerTransactions = wagerQueueUrl;
	(settings.sqs.queues as any).wagerTransactionsDlq = dlqQueueUrl;

	return {
		container,
		endpoint,
		wagerQueueUrl,
		dlqQueueUrl,

		stop: async () => {
			sqsClient.destroy();
			await container.stop();
		}
	};
}
