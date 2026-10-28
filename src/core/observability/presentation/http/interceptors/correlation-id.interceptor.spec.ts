import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { of } from 'rxjs';

import { MetricsService } from '../../../services/metrics.service';
import { RequestContextService } from '../../../services/request-context.service';
import { CorrelationIdInterceptor } from './correlation-id.interceptor';

describe('CorrelationIdInterceptor', () => {
	let sut: CorrelationIdInterceptor;
	let metricsService: MetricsService;
	let requestContextService: RequestContextService;

	let mockRequest: FastifyRequest & { correlationId?: string };
	let mockReply: {
		header: ReturnType<typeof mock>;
		statusCode: number;
	};
	let mockExecutionContext: ExecutionContext;
	let mockCallHandler: CallHandler;

	beforeEach(() => {
		requestContextService = new RequestContextService();
		metricsService = new MetricsService();
		sut = new CorrelationIdInterceptor(metricsService, requestContextService);

		mockRequest = {
			headers: {},
			url: '/wagering/bets',
			method: 'POST'
		} as unknown as FastifyRequest & { correlationId?: string };

		mockReply = {
			header: mock(),
			statusCode: 200
		};

		mockExecutionContext = {
			getType: () => 'http',
			switchToHttp: () => ({
				getRequest: () => mockRequest,
				getResponse: () => mockReply as unknown as FastifyReply
			})
		} as unknown as ExecutionContext;

		mockCallHandler = {
			handle: () => of({ ok: true })
		};
	});

	it('should reuse existing x-correlation-id header and set it on response', async () => {
		mockRequest.headers['x-correlation-id'] = 'custom-correlation-id-123';

		const observable = sut.intercept(mockExecutionContext, mockCallHandler);

		await new Promise<void>(resolve => {
			observable.subscribe({
				next: () => {},
				complete: () => resolve()
			});
		});

		expect(mockReply.header).toHaveBeenCalledWith('x-correlation-id', 'custom-correlation-id-123');
	});

	it('should generate a new UUID correlation-id when header is omitted', async () => {
		const observable = sut.intercept(mockExecutionContext, mockCallHandler);

		await new Promise<void>(resolve => {
			observable.subscribe({
				next: () => {},
				complete: () => resolve()
			});
		});

		expect(mockReply.header).toHaveBeenCalledTimes(1);
		const assignedId = mockReply.header.mock.calls[0][1] as string;
		expect(assignedId).toBeDefined();
		expect(assignedId.length).toBeGreaterThan(10);
	});

	it('should record wagering latency on successful request', async () => {
		const recordSpy = spyOn(metricsService, 'recordProcessingLatency');

		const observable = sut.intercept(mockExecutionContext, mockCallHandler);

		await new Promise<void>(resolve => {
			observable.subscribe({
				next: () => {},
				complete: () => resolve()
			});
		});

		expect(recordSpy).toHaveBeenCalledTimes(1);
	});
});
