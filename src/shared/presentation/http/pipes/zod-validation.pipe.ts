import { BadRequestException, PipeTransform } from '@nestjs/common';
import z, { ZodType } from 'zod';

export class ZodValidationPipe implements PipeTransform {
	constructor(private readonly schema: ZodType) {}

	transform(value: unknown) {
		const result = this.schema.safeParse(value);

		if (!result.success)
			throw new BadRequestException({
				code: 'VALIDATION_ERROR',
				message: 'Request payload validation failed',
				errors: z.flattenError(result.error)
			});

		return result.data;
	}
}
