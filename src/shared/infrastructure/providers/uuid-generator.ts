import { Injectable } from '@nestjs/common';

import { IIdGenerator } from '@/shared/application/providers/id-generator.interface';

@Injectable()
export class UuidGenerator implements IIdGenerator {
	generate(): string {
		return crypto.randomUUID();
	}
}
