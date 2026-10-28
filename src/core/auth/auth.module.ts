import { Global, Module } from '@nestjs/common';

import { ProviderIdentityAdapter } from './adapters/provider-identity.adapter';
import { ProviderAuthGuard } from './guards/provider-auth.guard';
import { IProviderIdentityPort } from './ports/provider-identity.port';

@Global()
@Module({
	providers: [
		{
			provide: IProviderIdentityPort,
			useClass: ProviderIdentityAdapter
		},
		ProviderAuthGuard
	],
	exports: [IProviderIdentityPort, ProviderAuthGuard]
})
export class AuthModule {}
