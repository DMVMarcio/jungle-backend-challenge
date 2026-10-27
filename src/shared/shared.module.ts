import { Global, Module } from '@nestjs/common';

import { UuidGenerator } from './infrastructure/providers/uuid-generator';
import { SHARED_TOKENS } from './shared.tokens';

@Global()
@Module({
	providers: [
		{
			provide: SHARED_TOKENS.ID_GENERATOR,
			useClass: UuidGenerator
		}
	],
	exports: [SHARED_TOKENS.ID_GENERATOR]
})
export class SharedModule {}
