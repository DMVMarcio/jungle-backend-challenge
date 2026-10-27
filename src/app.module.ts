import { Module } from '@nestjs/common';

import { DatabaseModule } from './core/database/database.module';
import { WageringModule } from './modules/wagering/wagering.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { SharedModule } from './shared/shared.module';

@Module({
	imports: [DatabaseModule, SharedModule, WalletModule, WageringModule]
})
export class AppModule {}
