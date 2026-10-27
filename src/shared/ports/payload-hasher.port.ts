export interface IPayloadHasher {
	hash(payload: unknown): string;
}
