import { Module, forwardRef } from '@nestjs/common';

import { OutboxModule } from '../outbox/outbox.module';
import { WalletModule } from '../wallet/wallet.module';
import { BetOperation } from './application/operations/bet.operation';
import { LossOperation } from './application/operations/loss.operation';
import { RefundOperation } from './application/operations/refund.operation';
import { RollbackOperation } from './application/operations/rollback.operation';
import { WinOperation } from './application/operations/win.operation';
import { WageringOutboxService } from './application/services/wagering-outbox.service';
import { GetProviderTransactionUseCase } from './application/use-cases/get-provider-transaction.use-case';
import { GetWagerTransactionUseCase } from './application/use-cases/get-wager-transaction.use-case';
import { ProcessWagerTransactionUseCase } from './application/use-cases/process-wager-transaction.use-case';
import { WagerTransactionMikroOrmRepository } from './infrastructure/database/wager-transaction.mikro-orm.repository';
import { WageringController } from './presentation/http/wagering.controller';
import { WAGERING_TOKENS } from './wagering.tokens';

@Module({
	imports: [forwardRef(() => WalletModule), OutboxModule],
	controllers: [WageringController],
	providers: [
		{
			provide: WAGERING_TOKENS.REPOSITORY,
			useClass: WagerTransactionMikroOrmRepository
		},
		WageringOutboxService,
		BetOperation,
		WinOperation,
		LossOperation,
		RefundOperation,
		RollbackOperation,
		ProcessWagerTransactionUseCase,
		GetWagerTransactionUseCase,
		GetProviderTransactionUseCase
	],
	exports: [
		WAGERING_TOKENS.REPOSITORY,
		ProcessWagerTransactionUseCase,
		GetWagerTransactionUseCase,
		GetProviderTransactionUseCase
	]
})
export class WageringModule {}
