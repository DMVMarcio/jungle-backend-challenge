import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { IPayloadHasher } from '@/shared/ports/payload-hasher.port';

@Injectable()
export class PayloadHasherSha256Adapter implements IPayloadHasher {
	hash(payload: unknown): string {
		const normalized = this.normalize(payload);

		return createHash('sha256').update(normalized).digest('hex');
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
