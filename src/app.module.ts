import { Module } from '@nestjs/common';

import { DatabaseModule } from './core/database/database.module';
import { WageringModule } from './modules/wagering/wagering.module';
import { WalletModule } from './modules/wallet/wallet.module';

@Module({
	imports: [DatabaseModule, WalletModule, WageringModule]
})
export class AppModule {}
