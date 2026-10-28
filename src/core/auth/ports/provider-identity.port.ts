export interface AuthenticatedProvider {
	providerId: string;
	clientId: string;
	scopes: string[];
}

export abstract class IProviderIdentityPort {
	abstract authenticate(tokenOrKey: string): Promise<AuthenticatedProvider | null>;
}
