import { SQSClient } from '@aws-sdk/client-sqs';
import { Injectable, OnModuleDestroy } from '@nestjs/common';

import { settings } from '@/core/settings';

@Injectable()
export class SqsClientService implements OnModuleDestroy {
	readonly client: SQSClient;

	constructor() {
		this.client = new SQSClient({
			region: settings.sqs.region,
			endpoint: settings.sqs.endpoint,
			credentials: {
				accessKeyId: settings.sqs.accessKeyId,
				secretAccessKey: settings.sqs.secretAccessKey
			}
		});
	}

	onModuleDestroy(): void {
		this.client.destroy();
	}
}
