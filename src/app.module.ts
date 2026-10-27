import { Module } from '@nestjs/common';

import { DatabaseModule } from './core/database/database.module';
import { WalletModule } from './modules/wallet/wallet.module';

@Module({
	imports: [DatabaseModule, WalletModule]
})
export class AppModule {}
