import { Controller, Get, Headers, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

import { MetricsService } from '../../../services/metrics.service';

@Controller('metrics')
export class MetricsController {
	constructor(private readonly metricsService: MetricsService) {}

	@Get()
	getMetrics(@Headers('accept') acceptHeader: string | undefined, @Res() reply: FastifyReply): void {
		if (acceptHeader?.includes('application/json')) {
			reply.header('content-type', 'application/json; charset=utf-8').send(this.metricsService.getSnapshot());
			return;
		}

		reply
			.header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
			.send(this.metricsService.toPrometheusFormat());
	}
}
