import { Module } from '@nestjs/common';

import { WalletMikroOrmRepository } from './infrastructure/database/wallet.mikro-orm.repository';
import { WALLET_TOKENS } from './wallet.tokens';

@Module({
	providers: [
		{
			provide: WALLET_TOKENS.REPOSITORY,
			useClass: WalletMikroOrmRepository
		}
	],
	exports: [WALLET_TOKENS.REPOSITORY]
})
export class WalletModule {}
