import { beforeEach, describe, expect, it } from 'bun:test';

import { IdGeneratorUuidAdapter } from './id-generator.uuid.adapter';

describe('Id Generator Uuid Adapter', () => {
	let sut: IdGeneratorUuidAdapter;

	beforeEach(() => {
		sut = new IdGeneratorUuidAdapter();
	});

	it('should generate a valid UUID v4 string', () => {
		const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

		const id = sut.generate();

		expect(id).toMatch(uuidRegex);
	});

	it('should generate unique IDs on consecutive calls', () => {
		const id1 = sut.generate();
		const id2 = sut.generate();

		expect(id1).not.toBe(id2);
	});
});
