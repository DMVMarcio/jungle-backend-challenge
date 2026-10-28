import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { AuthenticatedProvider } from '../ports/provider-identity.port';

export const CurrentProvider = createParamDecorator(
	(_data: unknown, context: ExecutionContext): AuthenticatedProvider | undefined => {
		const request = context.switchToHttp().getRequest();
		return request.authenticatedProvider;
	}
);
