import { Injectable } from '@nestjs/common';

import { formatPrometheusMetrics } from '../formatters/prometheus.formatter';

export interface MetricsSnapshot {
	transactions: Record<string, number>;
	duplicates: Record<string, number>;
	retries: Record<string, number>;
	dlqMessages: Record<string, number>;
	lockConflicts: number;
	outboxLag: number;
	latency: {
		count: number;
		sumMs: number;
		minMs: number;
		maxMs: number;
		avgMs: number;
		p50Ms: number;
		p95Ms: number;
		p99Ms: number;
	};
}

@Injectable()
export class MetricsService {
	private static readonly MAX_LATENCY_SAMPLES = 10000;

	private readonly transactions = new Map<string, number>();
	private readonly duplicates = new Map<string, number>();
	private readonly retries = new Map<string, number>();
	private readonly dlqMessages = new Map<string, number>();
	private lockConflicts = 0;
	private outboxLag = 0;
	private readonly latencySamples: number[] = [];
	private latencySum = 0;
	private latencyMin = 0;
	private latencyMax = 0;

	recordTransaction(status: string): void {
		const current = this.transactions.get(status) ?? 0;
		this.transactions.set(status, current + 1);
	}

	recordDuplicate(source: 'idempotency' | 'inbox'): void {
		const current = this.duplicates.get(source) ?? 0;
		this.duplicates.set(source, current + 1);
	}

	recordRetry(component: 'outbox' | 'sqs_consumer' | 'pending_reference'): void {
		const current = this.retries.get(component) ?? 0;
		this.retries.set(component, current + 1);
	}

	recordDlq(queue = 'wager-transactions-dlq.fifo'): void {
		const current = this.dlqMessages.get(queue) ?? 0;
		this.dlqMessages.set(queue, current + 1);
	}

	recordLockConflict(): void {
		this.lockConflicts++;
	}

	setOutboxLag(count: number): void {
		this.outboxLag = Math.max(0, count);
	}

	recordProcessingLatency(durationMs: number): void {
		const duration = Math.max(0, durationMs);
		this.latencySum += duration;

		if (this.latencySamples.length === 0) {
			this.latencyMin = duration;
			this.latencyMax = duration;
		} else {
			if (duration < this.latencyMin) this.latencyMin = duration;
			if (duration > this.latencyMax) this.latencyMax = duration;
		}

		if (this.latencySamples.length >= MetricsService.MAX_LATENCY_SAMPLES) {
			const removed = this.latencySamples.shift() ?? 0;
			this.latencySum -= removed;
		}

		this.latencySamples.push(duration);
	}

	getSnapshot(): MetricsSnapshot {
		const count = this.latencySamples.length;
		const sorted = [...this.latencySamples].sort((a, b) => a - b);

		const p50 = count === 0 ? 0 : (sorted[Math.floor((count - 1) * 0.5)] ?? 0);
		const p95 = count === 0 ? 0 : (sorted[Math.floor((count - 1) * 0.95)] ?? 0);
		const p99 = count === 0 ? 0 : (sorted[Math.floor((count - 1) * 0.99)] ?? 0);
		const avg = count === 0 ? 0 : Number((this.latencySum / count).toFixed(2));

		return {
			transactions: Object.fromEntries(this.transactions.entries()),
			duplicates: Object.fromEntries(this.duplicates.entries()),
			retries: Object.fromEntries(this.retries.entries()),
			dlqMessages: Object.fromEntries(this.dlqMessages.entries()),
			lockConflicts: this.lockConflicts,
			outboxLag: this.outboxLag,
			latency: {
				count,
				sumMs: Number(this.latencySum.toFixed(2)),
				minMs: Number(this.latencyMin.toFixed(2)),
				maxMs: Number(this.latencyMax.toFixed(2)),
				avgMs: avg,
				p50Ms: Number(p50.toFixed(2)),
				p95Ms: Number(p95.toFixed(2)),
				p99Ms: Number(p99.toFixed(2))
			}
		};
	}

	toPrometheusFormat(): string {
		return formatPrometheusMetrics(this.getSnapshot());
	}

	reset(): void {
		this.transactions.clear();
		this.duplicates.clear();
		this.retries.clear();
		this.dlqMessages.clear();
		this.lockConflicts = 0;
		this.outboxLag = 0;
		this.latencySamples.length = 0;
		this.latencySum = 0;
		this.latencyMin = 0;
		this.latencyMax = 0;
	}
}
