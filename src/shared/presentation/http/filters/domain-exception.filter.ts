import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { FastifyReply } from 'fastify';

import { BusinessRuleError, ConflictError, DomainError, NotFoundError, ValidationError } from '@/shared/domain/errors';

@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter {
	catch(exception: DomainError, host: ArgumentsHost) {
		const ctx = host.switchToHttp();
		const response = ctx.getResponse<FastifyReply>();

		const status = this.getHttpStatus(exception);

		response.status(status).send({
			code: exception.code,
			message: exception.message
		});
	}

	private getHttpStatus(error: DomainError): HttpStatus {
		if (error instanceof NotFoundError) return HttpStatus.NOT_FOUND;
		if (error instanceof ConflictError) return HttpStatus.CONFLICT;
		if (error instanceof BusinessRuleError) return HttpStatus.UNPROCESSABLE_ENTITY;
		if (error instanceof ValidationError) return HttpStatus.BAD_REQUEST;

		return HttpStatus.UNPROCESSABLE_ENTITY;
	}
}
