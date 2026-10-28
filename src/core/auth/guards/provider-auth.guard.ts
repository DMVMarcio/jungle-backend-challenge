import {
	type CanActivate,
	type ExecutionContext,
	ForbiddenException,
	Injectable,
	UnauthorizedException
} from '@nestjs/common';

import { settings } from '@/core/settings';

import { IProviderIdentityPort } from '../ports/provider-identity.port';

@Injectable()
export class ProviderAuthGuard implements CanActivate {
	constructor(private readonly providerIdentityPort: IProviderIdentityPort) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest();
		const authHeader = request.headers?.authorization;
		const requestedProviderId = request.body?.providerId ?? request.params?.providerId;

		if (authHeader) {
			const provider = await this.providerIdentityPort.authenticate(authHeader);
			if (!provider) throw new UnauthorizedException('Invalid or expired provider credentials');

			if (requestedProviderId && requestedProviderId !== provider.providerId)
				throw new ForbiddenException(
					'Provider identity mismatch: credentials do not match requested providerId'
				);

			request.authenticatedProvider = provider;
			return true;
		}

		if (settings.nodeEnv === 'production')
			throw new UnauthorizedException('Missing provider authorization credentials');

		const fallbackProviderId = requestedProviderId ?? 'guest-provider';
		request.authenticatedProvider = {
			providerId: fallbackProviderId,
			clientId: `${fallbackProviderId}-dev-client`,
			scopes: ['wagering:write', 'wagering:read']
		};

		return true;
	}
}
