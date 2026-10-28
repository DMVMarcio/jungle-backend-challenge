import { GetQueueAttributesCommand } from '@aws-sdk/client-sqs';
import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';

import { settings } from '../../../settings';
import { SqsClientService } from '../../../sqs/sqs-client.service';

export interface CheckHealthReadyOutput {
	isReady: boolean;
	checks: {
		database: 'healthy' | 'unhealthy';
		sqs: 'healthy' | 'unhealthy';
	};
}

@Injectable()
export class CheckHealthReadyUseCase {
	constructor(
		private readonly entityManager: EntityManager,
		private readonly sqsClientService: SqsClientService
	) {}

	async execute(): Promise<CheckHealthReadyOutput> {
		let databaseHealthy = false;
		let sqsHealthy = false;

		try {
			await this.entityManager.getConnection().execute('SELECT 1');
			databaseHealthy = true;
		} catch {}

		try {
			await this.sqsClientService.client.send(
				new GetQueueAttributesCommand({
					QueueUrl: settings.sqs.queues.wagerTransactions,
					AttributeNames: ['QueueArn']
				})
			);

			sqsHealthy = true;
		} catch {}

		return {
			isReady: databaseHealthy && sqsHealthy,
			checks: {
				database: databaseHealthy ? 'healthy' : 'unhealthy',
				sqs: sqsHealthy ? 'healthy' : 'unhealthy'
			}
		};
	}
}
