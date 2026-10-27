import { Global, Module } from '@nestjs/common';

import { Sha256PayloadHasher } from './infrastructure/providers/sha256-payload-hasher';
import { UuidGenerator } from './infrastructure/providers/uuid-generator';
import { SHARED_TOKENS } from './shared.tokens';

@Global()
@Module({
	providers: [
		{
			provide: SHARED_TOKENS.ID_GENERATOR,
			useClass: UuidGenerator
		},
		{
			provide: SHARED_TOKENS.PAYLOAD_HASHER,
			useClass: Sha256PayloadHasher
		}
	],
	exports: [SHARED_TOKENS.ID_GENERATOR, SHARED_TOKENS.PAYLOAD_HASHER]
})
export class SharedModule {}
