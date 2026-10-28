import { Module } from '@nestjs/common';

import { CheckHealthReadyUseCase } from './application/use-cases/check-health-ready.use-case';
import { HealthController } from './health.controller';

@Module({
	controllers: [HealthController],
	providers: [CheckHealthReadyUseCase],
	exports: [CheckHealthReadyUseCase]
})
export class HealthModule {}
