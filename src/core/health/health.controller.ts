import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';

import { CheckHealthReadyUseCase } from './application/use-cases/check-health-ready.use-case';

export interface HealthStatusResponse {
	status: 'ok' | 'error';
	checks?: {
		database: 'healthy' | 'unhealthy';
		sqs: 'healthy' | 'unhealthy';
	};
}

@Controller('health')
export class HealthController {
	constructor(private readonly checkHealthReadyUseCase: CheckHealthReadyUseCase) {}

	@Get('live')
	live(): HealthStatusResponse {
		return { status: 'ok' };
	}

	@Get('ready')
	async ready(): Promise<HealthStatusResponse> {
		const result = await this.checkHealthReadyUseCase.execute();

		if (!result.isReady) {
			throw new HttpException(
				{
					status: 'error',
					checks: result.checks
				},
				HttpStatus.SERVICE_UNAVAILABLE
			);
		}

		return {
			status: 'ok',
			checks: result.checks
		};
	}
}
