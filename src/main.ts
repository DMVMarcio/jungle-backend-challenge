import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import pc from 'picocolors';
import 'reflect-metadata';

import { CorrelationIdInterceptor } from '@/core/observability/presentation/http/interceptors/correlation-id.interceptor';
import { StructuredLogger } from '@/core/observability/services/structured-logger.service';
import { settings } from '@/core/settings';

import { AppModule } from './app.module';
import { DomainExceptionFilter } from './shared/presentation/http/filters/domain-exception.filter';

const bootstrap = async () => {
	const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());

	app.useLogger(app.get(StructuredLogger));

	app.useGlobalFilters(new DomainExceptionFilter());
	app.useGlobalInterceptors(app.get(CorrelationIdInterceptor));

	app.enableShutdownHooks();

	await app.listen({ port: settings.server.port, host: settings.server.host });

	const logger = new Logger('Bootstrap');
	logger.log(
		pc.green(
			`Server running on ${pc.yellow(`http://${settings.server.host}:${settings.server.port}`)} [env: ${pc.yellow(settings.nodeEnv)}]`
		)
	);
};

bootstrap();
