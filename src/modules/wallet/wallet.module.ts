import { Module } from '@nestjs/common';

import { WageringModule } from '../wagering/wagering.module';
import { CreateWalletUseCase } from './application/use-cases/create-wallet.use-case';
import { GetWalletUseCase } from './application/use-cases/get-wallet.use-case';
import { WalletLedgerEntryMikroOrmRepository } from './infrastructure/database/wallet-ledger-entry.mikro-orm.repository';
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
		{
			provide: WALLET_TOKENS.LEDGER_REPOSITORY,
			useClass: WalletLedgerEntryMikroOrmRepository
		},
		CreateWalletUseCase,
		GetWalletUseCase
	],
	exports: [WALLET_TOKENS.REPOSITORY, WALLET_TOKENS.LEDGER_REPOSITORY, CreateWalletUseCase, GetWalletUseCase]
})
export class WalletModule {}
