import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UsePipes } from '@nestjs/common';

import { CreateWalletUseCase } from '@/modules/wallet/application/use-cases/create-wallet.use-case';
import { GetWalletUseCase } from '@/modules/wallet/application/use-cases/get-wallet.use-case';

import { ZodValidationPipe } from '@/shared/presentation/http/pipes/zod-validation.pipe';

import { type CreateWalletDto, createWalletSchema } from './dto/create-wallet.dto';

@Controller('wallets')
export class WalletController {
	constructor(
		private readonly createWalletUseCase: CreateWalletUseCase,
		private readonly getWalletUseCase: GetWalletUseCase
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
}
