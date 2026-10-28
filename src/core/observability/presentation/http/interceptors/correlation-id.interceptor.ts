import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

import { MetricsService } from '../../../services/metrics.service';
import { RequestContextService } from '../../../services/request-context.service';

@Injectable()
export class CorrelationIdInterceptor implements NestInterceptor {
	private readonly logger = new Logger('Http');

	constructor(
		private readonly metricsService: MetricsService,
		private readonly requestContextService: RequestContextService
	) {}

	intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
		if (context.getType() !== 'http') {
			return next.handle();
		}

		const http = context.switchToHttp();
		const request = http.getRequest<FastifyRequest>();
		const reply = http.getResponse<FastifyReply>();

		const incomingHeader = request.headers['x-correlation-id'];
		const correlationId =
			typeof incomingHeader === 'string' && incomingHeader.trim().length > 0
				? incomingHeader.trim()
				: crypto.randomUUID();

		if (reply.header) reply.header('x-correlation-id', correlationId);

		const startTime = performance.now();
		const url = request.url;
		const method = request.method;

		const logRequest = (statusCode: number, errorMessage?: string) => {
			const durationMs = Number((performance.now() - startTime).toFixed(2));
			if (url.startsWith('/wagering')) {
				this.metricsService.recordProcessingLatency(durationMs);
			}

			const message = `HTTP ${method} ${url} ${statusCode}${errorMessage ? ` - ${errorMessage}` : ''}`;
			const meta = { correlationId, durationMs, statusCode, method, url };

			if (statusCode >= 500) {
				this.logger.error(message, undefined, meta);
			} else if (statusCode >= 400) {
				this.logger.warn(message, meta);
			} else {
				this.logger.log(message, meta);
			}
		};

		return new Observable(subscriber => {
			this.requestContextService.runWithContext({ correlationId }, () => {
				next.handle()
					.pipe(
						tap({
							next: () => logRequest(reply.statusCode || 200),
							error: (error: { status?: number; statusCode?: number; message?: string }) => {
								const statusCode = error.status || error.statusCode || 500;
								logRequest(statusCode, error.message ?? 'Error');
							}
						})
					)
					.subscribe(subscriber);
			});
		});
	}
}
