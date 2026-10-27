import { Global, Module } from '@nestjs/common';

import { IdGeneratorUuidAdapter } from './adapters/id-generator/id-generator.uuid.adapter';
import { PayloadHasherSha256Adapter } from './adapters/payload-hasher/payload-hasher.sha256.adapter';
import { SHARED_TOKENS } from './shared.tokens';

@Global()
@Module({
	providers: [
		{
			provide: SHARED_TOKENS.ID_GENERATOR,
			useClass: IdGeneratorUuidAdapter
		},
		{
			provide: SHARED_TOKENS.PAYLOAD_HASHER,
			useClass: PayloadHasherSha256Adapter
		}
	],
	exports: [SHARED_TOKENS.ID_GENERATOR, SHARED_TOKENS.PAYLOAD_HASHER]
})
export class SharedModule {}
