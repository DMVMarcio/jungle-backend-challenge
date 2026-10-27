// sort-imports-ignore
import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import pc from 'picocolors';

import { settings } from '@/core/settings';

import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { DomainExceptionFilter } from './shared/presentation/http/filters/domain-exception.filter';

const bootstrap = async () => {
	const logger = new Logger('Bootstrap');

	const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());

	app.useGlobalFilters(new DomainExceptionFilter());

	await app.listen({ port: settings.server.port, host: settings.server.host });

	logger.log(
		pc.green(
			`Server running on ${pc.yellow(`http://${settings.server.host}:${settings.server.port}`)} [env: ${pc.yellow(settings.nodeEnv)}]`
		)
	);
};

bootstrap();
