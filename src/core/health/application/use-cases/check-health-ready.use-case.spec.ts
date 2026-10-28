import type { SQSClient } from '@aws-sdk/client-sqs';
import { EntityManager } from '@mikro-orm/postgresql';
import { beforeEach, describe, expect, it, mock } from 'bun:test';

import type { SqsClientService } from '../../../sqs/sqs-client.service';
import { CheckHealthReadyUseCase } from './check-health-ready.use-case';

describe('CheckHealthReady UseCase', () => {
	let sut: CheckHealthReadyUseCase;

	let mockEntityManager: EntityManager;
	let mockExecute: ReturnType<typeof mock>;
	let mockSqsClient: { send: ReturnType<typeof mock> };
	let mockSqsClientService: SqsClientService;

	beforeEach(() => {
		mockExecute = mock();
		mockEntityManager = {
			getConnection: () => ({
				execute: mockExecute
			})
		} as unknown as EntityManager;

		mockSqsClient = { send: mock() };
		mockSqsClientService = {
			client: mockSqsClient as unknown as SQSClient,
			onModuleDestroy: () => {}
		};

		sut = new CheckHealthReadyUseCase(mockEntityManager, mockSqsClientService);
	});

	it('should return isReady true and healthy checks when both database and sqs succeed', async () => {
		mockExecute.mockResolvedValue([{ '?column?': 1 }]);
		mockSqsClient.send.mockResolvedValue({});

		const result = await sut.execute();

		expect(result).toEqual({
			isReady: true,
			checks: {
				database: 'healthy',
				sqs: 'healthy'
			}
		});
	});

	it('should return isReady false when database is unreachable', async () => {
		mockExecute.mockRejectedValue(new Error('Connection refused'));
		mockSqsClient.send.mockResolvedValue({});

		const result = await sut.execute();

		expect(result).toEqual({
			isReady: false,
			checks: {
				database: 'unhealthy',
				sqs: 'healthy'
			}
		});
	});

	it('should return isReady false when SQS is unreachable', async () => {
		mockExecute.mockResolvedValue([{ '?column?': 1 }]);
		mockSqsClient.send.mockRejectedValue(new Error('SQS connection error'));

		const result = await sut.execute();

		expect(result).toEqual({
			isReady: false,
			checks: {
				database: 'healthy',
				sqs: 'unhealthy'
			}
		});
	});

	it('should return isReady false when both database and SQS fail', async () => {
		mockExecute.mockRejectedValue(new Error('DB unreachable'));
		mockSqsClient.send.mockRejectedValue(new Error('SQS unreachable'));

		const result = await sut.execute();

		expect(result).toEqual({
			isReady: false,
			checks: {
				database: 'unhealthy',
				sqs: 'unhealthy'
			}
		});
	});
});
