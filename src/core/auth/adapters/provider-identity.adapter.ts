import { Injectable } from '@nestjs/common';

import { type AuthenticatedProvider, IProviderIdentityPort } from '../ports/provider-identity.port';

@Injectable()
export class ProviderIdentityAdapter implements IProviderIdentityPort {
	async authenticate(authHeader: string): Promise<AuthenticatedProvider | null> {
		const raw = authHeader.trim();
		if (!raw || !raw.startsWith('Bearer ')) return null;

		const token = raw.slice(7).trim();
		if (!token) return null;

		let providerId = token;

		if (token.includes(':')) {
			const parts = token.split(':');
			providerId = parts[parts.length - 1] || token;
		}

		return {
			providerId,
			clientId: `${providerId}-service-client`,
			scopes: ['wagering:write', 'wagering:read']
		};
	}
}
