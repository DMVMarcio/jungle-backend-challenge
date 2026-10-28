import { Module } from '@nestjs/common';

import { DatabaseModule } from './core/database/database.module';
import { HealthModule } from './core/health/health.module';
import { SqsModule } from './core/sqs/sqs.module';
import { InboxModule } from './modules/inbox/inbox.module';
import { OutboxModule } from './modules/outbox/outbox.module';
import { WageringModule } from './modules/wagering/wagering.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { SharedModule } from './shared/shared.module';

@Module({
	imports: [
		DatabaseModule,
		SharedModule,
		SqsModule,
		HealthModule,
		InboxModule,
		OutboxModule,
		WalletModule,
		WageringModule
	]
})
export class AppModule {}
