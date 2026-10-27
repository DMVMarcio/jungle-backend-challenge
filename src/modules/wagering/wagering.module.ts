import { Module } from '@nestjs/common';

import { WagerTransactionMikroOrmRepository } from './infrastructure/database/wager-transaction.mikro-orm.repository';
import { WAGERING_TOKENS } from './wagering.tokens';

@Module({
	providers: [
		{
			provide: WAGERING_TOKENS.REPOSITORY,
			useClass: WagerTransactionMikroOrmRepository
		}
	],
	exports: [WAGERING_TOKENS.REPOSITORY]
})
export class WageringModule {}
