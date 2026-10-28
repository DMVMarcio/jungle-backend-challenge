import { type ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'bun:test';

import { settings } from '@/core/settings';

import { ProviderIdentityAdapter } from '../adapters/provider-identity.adapter';
import type { AuthenticatedProvider } from '../ports/provider-identity.port';
import { ProviderAuthGuard } from './provider-auth.guard';

interface MockRequest {
	headers?: Record<string, string>;
	body?: Record<string, unknown>;
	params?: Record<string, string>;
	authenticatedProvider?: AuthenticatedProvider;
}

describe('ProviderAuthGuard', () => {
	let sut: ProviderAuthGuard;
	let providerIdentityAdapter: ProviderIdentityAdapter;

	beforeEach(() => {
		providerIdentityAdapter = new ProviderIdentityAdapter();
		sut = new ProviderAuthGuard(providerIdentityAdapter);
	});

	function createMockContext(request: MockRequest): ExecutionContext {
		return {
			switchToHttp: () => ({
				getRequest: () => request
			})
		} as unknown as ExecutionContext;
	}

	it('should allow request when bearer token provider matches body providerId', async () => {
		const request: MockRequest = {
			headers: { authorization: 'Bearer provider-a' },
			body: { providerId: 'provider-a', externalTransactionId: 'tx-1' }
		};

		const result = await sut.canActivate(createMockContext(request));

		expect(result).toBe(true);
		expect(request.authenticatedProvider).toEqual({
			providerId: 'provider-a',
			clientId: 'provider-a-service-client',
			scopes: ['wagering:write', 'wagering:read']
		});
	});

	it('should allow request when bearer token provider matches route param providerId', async () => {
		const request: MockRequest = {
			headers: { authorization: 'Bearer spribe' },
			params: { providerId: 'spribe' }
		};

		const result = await sut.canActivate(createMockContext(request));

		expect(result).toBe(true);
		expect(request.authenticatedProvider?.providerId).toBe('spribe');
	});

	it('should throw ForbiddenException when authenticated token provider does not match body providerId', async () => {
		const request: MockRequest = {
			headers: { authorization: 'Bearer provider-a' },
			body: { providerId: 'provider-b', externalTransactionId: 'tx-1' }
		};

		expect(sut.canActivate(createMockContext(request))).rejects.toThrow(ForbiddenException);
	});

	it('should throw ForbiddenException when authenticated token provider does not match route param providerId', async () => {
		const request: MockRequest = {
			headers: { authorization: 'Bearer provider-a' },
			params: { providerId: 'provider-b' }
		};

		expect(sut.canActivate(createMockContext(request))).rejects.toThrow(ForbiddenException);
	});

	it('should throw UnauthorizedException when token is empty or invalid', async () => {
		const request: MockRequest = {
			headers: { authorization: 'Bearer   ' },
			body: { providerId: 'provider-a' }
		};

		expect(sut.canActivate(createMockContext(request))).rejects.toThrow(UnauthorizedException);
	});

	it('should allow request without auth header in dev/test environment and inject fallback', async () => {
		const request: MockRequest = {
			headers: {},
			body: { providerId: 'pragmatic' }
		};

		const result = await sut.canActivate(createMockContext(request));

		expect(result).toBe(true);
		expect(request.authenticatedProvider?.providerId).toBe('pragmatic');
	});

	it('should throw UnauthorizedException in production environment when auth header is missing', async () => {
		const originalEnv = settings.nodeEnv;
		settings.nodeEnv = 'production';

		try {
			const request: MockRequest = {
				headers: {},
				body: { providerId: 'pragmatic' }
			};

			expect(sut.canActivate(createMockContext(request))).rejects.toThrow(UnauthorizedException);
		} finally {
			settings.nodeEnv = originalEnv;
		}
	});
});
