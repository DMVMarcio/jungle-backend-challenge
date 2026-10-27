import { Injectable } from '@nestjs/common';

import { IIdGenerator } from '@/shared/ports/id-generator.port';

@Injectable()
export class IdGeneratorUuidAdapter implements IIdGenerator {
	generate(): string {
		return crypto.randomUUID();
	}
}
