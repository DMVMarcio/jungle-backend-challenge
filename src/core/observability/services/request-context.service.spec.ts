import { describe, expect, it } from 'bun:test';

import { RequestContextService } from './request-context.service';

describe('Request Context Service', () => {
	const sut = new RequestContextService();

	it('should return undefined when context is not active', () => {
		expect(sut.getStore()).toBeUndefined();
		expect(sut.getCorrelationId()).toBeUndefined();
	});

	it('should provide context inside runWithContext callback', () => {
		sut.runWithContext({ correlationId: 'corr-123', providerId: 'provider-a' }, () => {
			expect(sut.getStore()).toEqual({ correlationId: 'corr-123', providerId: 'provider-a' });
			expect(sut.getCorrelationId()).toBe('corr-123');
		});
	});

	it('should allow mutating context variables within the active callback', () => {
		sut.runWithContext({ correlationId: 'corr-initial' }, () => {
			sut.set('walletId', 'wallet-999');
			sut.set('transactionId', 'tx-888');

			const store = sut.getStore();
			expect(store?.walletId).toBe('wallet-999');
			expect(store?.transactionId).toBe('tx-888');
		});
	});

	it('should isolate context across asynchronous execution branches', async () => {
		const branch1 = new Promise<string | undefined>(resolve => {
			sut.runWithContext({ correlationId: 'corr-branch-1' }, () => {
				setTimeout(() => {
					resolve(sut.getCorrelationId());
				}, 10);
			});
		});

		const branch2 = new Promise<string | undefined>(resolve => {
			sut.runWithContext({ correlationId: 'corr-branch-2' }, () => {
				setTimeout(() => {
					resolve(sut.getCorrelationId());
				}, 5);
			});
		});

		const [res1, res2] = await Promise.all([branch1, branch2]);
		expect(res1).toBe('corr-branch-1');
		expect(res2).toBe('corr-branch-2');
	});
});
