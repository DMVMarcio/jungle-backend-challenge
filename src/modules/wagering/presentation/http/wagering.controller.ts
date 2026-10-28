import {
	Body,
	Controller,
	Get,
	Headers,
	HttpStatus,
	Param,
	Post,
	Res,
	UsePipes
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';

import { GetProviderTransactionUseCase } from '@/modules/wagering/application/use-cases/get-provider-transaction.use-case';
import { GetWagerTransactionUseCase } from '@/modules/wagering/application/use-cases/get-wager-transaction.use-case';
import { ProcessWagerTransactionUseCase } from '@/modules/wagering/application/use-cases/process-wager-transaction.use-case';
import { WagerTransactionStatus } from '@/modules/wagering/domain/wager-transaction';
import { ZodValidationPipe } from '@/shared/presentation/http/pipes/zod-validation.pipe';

import {
	type CreateWagerTransactionDto,
	createWagerTransactionSchema
} from './dto/create-wager-transaction.dto';
import {
	type ProviderTransactionParamsDto,
	type WagerTransactionIdParamDto,
	providerTransactionParamsSchema,
	wagerTransactionIdParamSchema
} from './dto/wager-transaction-params.dto';

@Controller()
export class WageringController {
	constructor(
		private readonly processWagerTransactionUseCase: ProcessWagerTransactionUseCase,
		private readonly getWagerTransactionUseCase: GetWagerTransactionUseCase,
		private readonly getProviderTransactionUseCase: GetProviderTransactionUseCase
	) {}

	@Post('wagering/transactions')
	@UsePipes(new ZodValidationPipe(createWagerTransactionSchema))
	async processTransaction(
		@Headers('idempotency-key') idempotencyKeyHeader: string | undefined,
		@Body() body: CreateWagerTransactionDto,
		@Res({ passthrough: true }) res: FastifyReply
	) {
		const idempotencyKey =
			idempotencyKeyHeader?.trim() || `${body.providerId}:${body.externalTransactionId}`;

		const result = await this.processWagerTransactionUseCase.execute({
			...body,
			idempotencyKey
		});

		if (result.status === WagerTransactionStatus.PendingReference) {
			res.status(HttpStatus.ACCEPTED);
		} else if (result.status === WagerTransactionStatus.Rejected) {
			res.status(HttpStatus.UNPROCESSABLE_ENTITY);
		} else {
			res.status(HttpStatus.OK);
		}

		return result;
	}

	@Get('wagering/transactions/:transactionId')
	async findById(
		@Param(new ZodValidationPipe(wagerTransactionIdParamSchema))
		{ transactionId }: WagerTransactionIdParamDto
	) {
		return this.getWagerTransactionUseCase.execute({ transactionId });
	}

	@Get('providers/:providerId/wagering/transactions/:externalTransactionId')
	async findByProviderAndExternalId(
		@Param(new ZodValidationPipe(providerTransactionParamsSchema))
		params: ProviderTransactionParamsDto
	) {
		return this.getProviderTransactionUseCase.execute(params);
	}
}
