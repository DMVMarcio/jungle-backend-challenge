export abstract class DomainError extends Error {
	abstract readonly code: string;

	constructor(message: string) {
		super(message);

		this.name = this.constructor.name;
		Error.captureStackTrace?.(this, this.constructor);
	}
}

export abstract class NotFoundError extends DomainError {}
export abstract class ConflictError extends DomainError {}
export abstract class BusinessRuleError extends DomainError {}
export abstract class ValidationError extends DomainError {}
