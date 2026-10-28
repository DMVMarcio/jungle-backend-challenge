import { Module } from '@nestjs/common';

import { INBOX_TOKENS } from './inbox.tokens';
import { InboxMikroOrmRepository } from './infrastructure/database/inbox.mikro-orm.repository';

@Module({
	providers: [
		{
			provide: INBOX_TOKENS.REPOSITORY,
			useClass: InboxMikroOrmRepository
		}
	],
	exports: [INBOX_TOKENS.REPOSITORY]
})
export class InboxModule {}
