import { Global, Module } from '@nestjs/common';

import { SqsClientService } from './sqs-client.service';

@Global()
@Module({
	providers: [SqsClientService],
	exports: [SqsClientService]
})
export class SqsModule {}
