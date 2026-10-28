import { Global, Module } from '@nestjs/common';

import { MetricsController } from './presentation/http/controllers/metrics.controller';
import { CorrelationIdInterceptor } from './presentation/http/interceptors/correlation-id.interceptor';
import { MetricsService } from './services/metrics.service';
import { RequestContextService } from './services/request-context.service';
import { StructuredLogger } from './services/structured-logger.service';

@Global()
@Module({
	controllers: [MetricsController],
	providers: [RequestContextService, StructuredLogger, MetricsService, CorrelationIdInterceptor],
	exports: [RequestContextService, StructuredLogger, MetricsService, CorrelationIdInterceptor]
})
export class ObservabilityModule {}
