// sort-imports-ignore
import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';

import { AppModule } from './app.module';

const bootstrap = async () => {
	const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());

	await app.listen({ port: 3000, host: '0.0.0.0' });
};

bootstrap();
