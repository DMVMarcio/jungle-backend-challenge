export interface AuthenticatedProvider {
	providerId: string;
	clientId: string;
	scopes: string[];
}

export abstract class IProviderIdentityPort {
	abstract authenticate(authHeader: string): Promise<AuthenticatedProvider | null>;
}
