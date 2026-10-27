import { Module } from '@nestjs/common';

import { OutboxMikroOrmRepository } from './infrastructure/database/outbox.mikro-orm.repository';
import { OUTBOX_TOKENS } from './outbox.tokens';

@Module({
	providers: [
		{
			provide: OUTBOX_TOKENS.REPOSITORY,
			useClass: OutboxMikroOrmRepository
		}
	],
	exports: [OUTBOX_TOKENS.REPOSITORY]
})
export class OutboxModule {}
