export interface IPayloadHasher {
	hash(data: unknown): string;
}
