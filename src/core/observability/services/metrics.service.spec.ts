import { beforeEach, describe, expect, it } from 'bun:test';

import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
	let sut: MetricsService;

	beforeEach(() => {
		sut = new MetricsService();
	});

	it('should record transactions by status', () => {
		sut.recordTransaction('PROCESSED');
		sut.recordTransaction('PROCESSED');
		sut.recordTransaction('REJECTED');

		const snapshot = sut.getSnapshot();
		expect(snapshot.transactions['PROCESSED']).toBe(2);
		expect(snapshot.transactions['REJECTED']).toBe(1);
	});

	it('should record duplicate detections', () => {
		sut.recordDuplicate('idempotency');
		sut.recordDuplicate('idempotency');
		sut.recordDuplicate('inbox');

		const snapshot = sut.getSnapshot();
		expect(snapshot.duplicates['idempotency']).toBe(2);
		expect(snapshot.duplicates['inbox']).toBe(1);
	});

	it('should record retries by component', () => {
		sut.recordRetry('outbox');
		sut.recordRetry('sqs_consumer');
		sut.recordRetry('outbox');

		const snapshot = sut.getSnapshot();
		expect(snapshot.retries['outbox']).toBe(2);
		expect(snapshot.retries['sqs_consumer']).toBe(1);
	});

	it('should record DLQ messages, lock conflicts and outbox lag', () => {
		sut.recordDlq('test-dlq.fifo');
		sut.recordLockConflict();
		sut.recordLockConflict();
		sut.setOutboxLag(14);

		const snapshot = sut.getSnapshot();
		expect(snapshot.dlqMessages['test-dlq.fifo']).toBe(1);
		expect(snapshot.lockConflicts).toBe(2);
		expect(snapshot.outboxLag).toBe(14);
	});

	it('should calculate accurate latency metrics including percentiles', () => {
		for (let i = 1; i <= 100; i++) {
			sut.recordProcessingLatency(i);
		}

		const snapshot = sut.getSnapshot();
		expect(snapshot.latency.count).toBe(100);
		expect(snapshot.latency.minMs).toBe(1);
		expect(snapshot.latency.maxMs).toBe(100);
		expect(snapshot.latency.avgMs).toBe(50.5);
		expect(snapshot.latency.p50Ms).toBe(50);
		expect(snapshot.latency.p95Ms).toBe(95);
		expect(snapshot.latency.p99Ms).toBe(99);
	});

	it('should render Prometheus exposition text format', () => {
		sut.recordTransaction('PROCESSED');
		sut.recordDuplicate('idempotency');
		sut.recordLockConflict();
		sut.setOutboxLag(5);
		sut.recordProcessingLatency(25);

		const prometheusText = sut.toPrometheusFormat();

		expect(prometheusText).toContain('wager_transactions_total{status="PROCESSED"} 1');
		expect(prometheusText).toContain('wager_duplicates_detected_total{source="idempotency"} 1');
		expect(prometheusText).toContain('wager_lock_conflicts_total 1');
		expect(prometheusText).toContain('wager_outbox_lag 5');
		expect(prometheusText).toContain('wager_processing_latency_ms_count 1');
	});

	it('should reset all recorded metrics', () => {
		sut.recordTransaction('PROCESSED');
		sut.recordLockConflict();
		sut.reset();

		const snapshot = sut.getSnapshot();
		expect(Object.keys(snapshot.transactions).length).toBe(0);
		expect(snapshot.lockConflicts).toBe(0);
		expect(snapshot.latency.count).toBe(0);
	});
});
