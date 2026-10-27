import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { IPayloadHasher } from '@/shared/application/providers/payload-hasher.interface';

@Injectable()
export class Sha256PayloadHasher implements IPayloadHasher {
	hash(data: unknown): string {
		const serialized = this.normalize(data);

		return createHash('sha256').update(serialized).digest('hex');
	}

	private normalize(data: unknown): string {
		if (data === null || typeof data !== 'object') return JSON.stringify(data);
		if (Array.isArray(data)) return `[${data.map(item => this.normalize(item)).join(',')}]`;

		const obj = data as Record<string, unknown>;
		const sortedKeys = Object.keys(obj).sort();

		const entries = sortedKeys
			.filter(key => obj[key] !== undefined)
			.map(key => `${JSON.stringify(key)}:${this.normalize(obj[key])}`);

		return `{${entries.join(',')}}`;
	}
}
