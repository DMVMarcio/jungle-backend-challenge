import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UsePipes } from '@nestjs/common';

import { CreateWalletUseCase } from '@/modules/wallet/application/use-cases/create-wallet.use-case';
import { GetWalletLedgerUseCase } from '@/modules/wallet/application/use-cases/get-wallet-ledger.use-case';
import { GetWalletUseCase } from '@/modules/wallet/application/use-cases/get-wallet.use-case';
import { ReconcileWalletUseCase } from '@/modules/wallet/application/use-cases/reconcile-wallet.use-case';
import { ZodValidationPipe } from '@/shared/presentation/http/pipes/zod-validation.pipe';

import { type CreateWalletDto, createWalletSchema } from './dto/create-wallet.dto';
import { type GetWalletLedgerQueryDto, getWalletLedgerQuerySchema } from './dto/get-wallet-ledger.dto';

@Controller('wallets')
export class WalletController {
	constructor(
		private readonly createWalletUseCase: CreateWalletUseCase,
		private readonly getWalletUseCase: GetWalletUseCase,
		private readonly getWalletLedgerUseCase: GetWalletLedgerUseCase,
		private readonly reconcileWalletUseCase: ReconcileWalletUseCase
	) {}

	@Post()
	@UsePipes(new ZodValidationPipe(createWalletSchema))
	async create(@Body() body: CreateWalletDto) {
		return this.createWalletUseCase.execute(body);
	}

	@Get(':walletId')
	async findById(@Param('walletId', new ParseUUIDPipe()) walletId: string) {
		return this.getWalletUseCase.execute({ walletId });
	}

	@Get(':walletId/ledger')
	async getLedger(
		@Param('walletId', new ParseUUIDPipe()) walletId: string,
		@Query(new ZodValidationPipe(getWalletLedgerQuerySchema)) query: GetWalletLedgerQueryDto
	) {
		return this.getWalletLedgerUseCase.execute({
			walletId,
			cursor: query?.cursor,
			limit: query?.limit
		});
	}

	@Post(':walletId/reconciliation')
	async reconcile(@Param('walletId', new ParseUUIDPipe()) walletId: string) {
		return this.reconcileWalletUseCase.execute({ walletId });
	}
}
