import { Module } from '@nestjs/common';

import { WageringModule } from '../wagering/wagering.module';
import { CreateWalletUseCase } from './application/use-cases/create-wallet.use-case';
import { GetWalletUseCase } from './application/use-cases/get-wallet.use-case';
import { WalletMikroOrmRepository } from './infrastructure/database/wallet.mikro-orm.repository';
import { WalletController } from './presentation/http/wallet.controller';
import { WALLET_TOKENS } from './wallet.tokens';

@Module({
	imports: [WageringModule],
	controllers: [WalletController],
	providers: [
		{
			provide: WALLET_TOKENS.REPOSITORY,
			useClass: WalletMikroOrmRepository
		},
		CreateWalletUseCase,
		GetWalletUseCase
	],
	exports: [WALLET_TOKENS.REPOSITORY, CreateWalletUseCase, GetWalletUseCase]
})
export class WalletModule {}
