import { beforeEach, describe, expect, it } from 'bun:test';

import { PayloadHasherSha256Adapter } from './payload-hasher.sha256.adapter';

describe('Payload Hasher Sha256 Adapter', () => {
	let sut: PayloadHasherSha256Adapter;

	beforeEach(() => {
		sut = new PayloadHasherSha256Adapter();
	});

	it('should produce the same hash for objects with differently ordered keys', () => {
		const payload1 = { roundId: 'round-1', amount: '25.00', gameId: 'slots' };
		const payload2 = { gameId: 'slots', roundId: 'round-1', amount: '25.00' };

		expect(sut.hash(payload1)).toBe(sut.hash(payload2));
	});

	it('should produce the same hash for nested objects with differently ordered keys', () => {
		const payload1 = {
			outer: { b: 2, a: 1 },
			items: [{ y: 20, x: 10 }]
		};

		const payload2 = {
			items: [{ x: 10, y: 20 }],
			outer: { a: 1, b: 2 }
		};

		expect(sut.hash(payload1)).toBe(sut.hash(payload2));
	});

	it('should produce different hashes for different contents', () => {
		const payload1 = { amount: '25.00' };
		const payload2 = { amount: '25.01' };

		expect(sut.hash(payload1)).not.toBe(sut.hash(payload2));
	});
});
