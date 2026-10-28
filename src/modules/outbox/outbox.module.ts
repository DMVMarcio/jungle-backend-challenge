import { Module } from '@nestjs/common';

import { OutboxMikroOrmRepository } from './infrastructure/database/outbox.mikro-orm.repository';
import { OutboxPublisherWorker } from './infrastructure/workers/outbox-publisher.worker';
import { OUTBOX_TOKENS } from './outbox.tokens';

@Module({
	providers: [
		{
			provide: OUTBOX_TOKENS.REPOSITORY,
			useClass: OutboxMikroOrmRepository
		},
		OutboxPublisherWorker
	],
	exports: [OUTBOX_TOKENS.REPOSITORY, OutboxPublisherWorker]
})
export class OutboxModule {}
