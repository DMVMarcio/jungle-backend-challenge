import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';

import { RequestContextService } from './request-context.service';
import { StructuredLogger } from './structured-logger.service';

describe('StructuredLogger', () => {
	let requestContextService: RequestContextService;
	let sut: StructuredLogger;
	let logSpy: ReturnType<typeof spyOn>;
	let errorSpy: ReturnType<typeof spyOn>;

	beforeEach(() => {
		requestContextService = new RequestContextService();
		sut = new StructuredLogger(requestContextService);
		logSpy = spyOn(console, 'log').mockImplementation(() => {});
		errorSpy = spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		logSpy.mockRestore();
		errorSpy.mockRestore();
	});

	it('should format info logs as valid JSON with standard fields', () => {
		sut.info('Operation finished', { context: 'TestContext', transactionId: 'tx-1' });

		expect(logSpy).toHaveBeenCalledTimes(1);
		const loggedJson = JSON.parse(logSpy.mock.calls[0][0] as string);

		expect(loggedJson.level).toBe('INFO');
		expect(loggedJson.message).toBe('Operation finished');
		expect(loggedJson.context).toBe('TestContext');
		expect(loggedJson.transactionId).toBe('tx-1');
		expect(loggedJson.timestamp).toBeDefined();
	});

	it('should automatically pull correlationId and walletId from active request context', () => {
		requestContextService.runWithContext(
			{ correlationId: 'corr-xyz', walletId: 'wallet-123', providerId: 'provider-1' },
			() => {
				sut.info('Processing wager');
			}
		);

		expect(logSpy).toHaveBeenCalledTimes(1);
		const loggedJson = JSON.parse(logSpy.mock.calls[0][0] as string);

		expect(loggedJson.correlationId).toBe('corr-xyz');
		expect(loggedJson.walletId).toBe('wallet-123');
		expect(loggedJson.providerId).toBe('provider-1');
	});

	it('should strip sensitive financial payloads and credentials', () => {
		sut.info('Wager payload received', {
			context: 'SecurityTest',
			authorization: 'Bearer secret-token',
			token: 'jwt-123',
			password: 'secretPassword',
			money: { amount: '100.00' },
			payload: { secret: 'data' }
		});

		expect(logSpy).toHaveBeenCalledTimes(1);
		const loggedJson = JSON.parse(logSpy.mock.calls[0][0] as string);

		expect(loggedJson.authorization).toBeUndefined();
		expect(loggedJson.token).toBeUndefined();
		expect(loggedJson.password).toBeUndefined();
		expect(loggedJson.money).toBeUndefined();
		expect(loggedJson.payload).toBeUndefined();
	});

	it('should output error logs to console.error with trace', () => {
		sut.error('Something failed', 'Error: Stack trace here', { context: 'ErrorContext' });

		expect(errorSpy).toHaveBeenCalledTimes(1);
		const loggedJson = JSON.parse(errorSpy.mock.calls[0][0] as string);

		expect(loggedJson.level).toBe('ERROR');
		expect(loggedJson.message).toBe('Something failed');
		expect(loggedJson.trace).toBe('Error: Stack trace here');
	});
});
