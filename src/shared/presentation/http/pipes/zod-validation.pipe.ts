import { ArgumentMetadata, BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodType } from 'zod';

export class ZodValidationPipe implements PipeTransform {
	constructor(private readonly schema: ZodType) {}

	transform(value: unknown, metadata?: ArgumentMetadata) {
		const targetValue = metadata?.type === 'query' && (value === undefined || value === null) ? {} : value;
		const result = this.schema.safeParse(targetValue);

		if (!result.success) {
			const formattedErrors = result.error.issues.map(issue => ({
				field: issue.path.join('.') || 'root',
				message: issue.message
			}));

			throw new BadRequestException({
				code: 'VALIDATION_ERROR',
				message: 'Request payload validation failed',
				errors: formattedErrors
			});
		}

		return result.data;
	}
}
