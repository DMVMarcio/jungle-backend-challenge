import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'bun:test';
import { z } from 'zod';

import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
	const sampleSchema = z.object({
		name: z.string(),
		age: z.number()
	});

	const querySchema = z.object({
		limit: z.coerce.number().default(50),
		cursor: z.string().optional()
	});

	it('should return parsed data when payload is valid', () => {
		const pipe = new ZodValidationPipe(sampleSchema);
		const result = pipe.transform({ name: 'John', age: 30 });

		expect(result).toEqual({ name: 'John', age: 30 });
	});

	it('should throw BadRequestException when validation fails', () => {
		const pipe = new ZodValidationPipe(sampleSchema);

		expect(() => pipe.transform({ name: 'John', age: 'invalid' })).toThrow(BadRequestException);

		try {
			pipe.transform({ name: 'John', age: 'invalid' });
		} catch (error) {
			const res = (error as BadRequestException).getResponse() as {
				code: string;
				errors: Array<{ field: string }>;
			};
			expect(res.code).toBe('VALIDATION_ERROR');
			expect(res.errors[0].field).toBe('age');
		}
	});

	it('should automatically treat undefined query params as empty object and apply defaults', () => {
		const pipe = new ZodValidationPipe(querySchema);
		const result = pipe.transform(undefined, { type: 'query' });

		expect(result).toEqual({ limit: 50 });
	});
});
