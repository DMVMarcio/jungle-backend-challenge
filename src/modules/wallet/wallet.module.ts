import { Module, forwardRef } from '@nestjs/common';

import { OutboxModule } from '../outbox/outbox.module';
import { WageringModule } from '../wagering/wagering.module';
import { CreateWalletUseCase } from './application/use-cases/create-wallet.use-case';
import { GetWalletLedgerUseCase } from './application/use-cases/get-wallet-ledger.use-case';
import { GetWalletUseCase } from './application/use-cases/get-wallet.use-case';
import { ReconcileWalletUseCase } from './application/use-cases/reconcile-wallet.use-case';
import { WalletLedgerEntryMikroOrmRepository } from './infrastructure/database/wallet-ledger-entry.mikro-orm.repository';
import { WalletMikroOrmRepository } from './infrastructure/database/wallet.mikro-orm.repository';
import { WalletController } from './presentation/http/wallet.controller';
import { WALLET_TOKENS } from './wallet.tokens';

@Module({
	imports: [forwardRef(() => WageringModule), OutboxModule],
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
		GetWalletUseCase,
		GetWalletLedgerUseCase,
		ReconcileWalletUseCase
	],
	exports: [
		WALLET_TOKENS.REPOSITORY,
		WALLET_TOKENS.LEDGER_REPOSITORY,
		CreateWalletUseCase,
		GetWalletUseCase,
		GetWalletLedgerUseCase,
		ReconcileWalletUseCase
	]
})
export class WalletModule {}
