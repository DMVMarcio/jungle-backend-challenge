import type { MetricsSnapshot } from '../services/metrics.service';

export const formatPrometheusMetrics = (snapshot: MetricsSnapshot): string => {
	const formatCounterMap = (name: string, help: string, label: string, map: Record<string, number>): string => {
		const entries = Object.entries(map);
		const lines =
			entries.length === 0
				? [`${name}{${label}="NONE"} 0`]
				: entries.map(([key, val]) => `${name}{${label}="${key}"} ${val}`);
		return [`# HELP ${name} ${help}`, `# TYPE ${name} counter`, ...lines].join('\n');
	};

	return (
		[
			formatCounterMap(
				'wager_transactions_total',
				'Total wagering transactions processed by status',
				'status',
				snapshot.transactions
			),
			formatCounterMap(
				'wager_duplicates_detected_total',
				'Total duplicate transactions detected',
				'source',
				snapshot.duplicates
			),
			formatCounterMap(
				'wager_retries_total',
				'Total background or broker retry attempts',
				'component',
				snapshot.retries
			),
			formatCounterMap('wager_dlq_messages_total', 'Total messages moved to DLQ', 'queue', snapshot.dlqMessages),
			`# HELP wager_lock_conflicts_total Total database lock and unique concurrency conflicts detected\n# TYPE wager_lock_conflicts_total counter\nwager_lock_conflicts_total ${snapshot.lockConflicts}`,
			`# HELP wager_reconciliation_discrepancies_total Total wallet reconciliation discrepancies detected\n# TYPE wager_reconciliation_discrepancies_total counter\nwager_reconciliation_discrepancies_total ${snapshot.reconciliationDiscrepancies}`,
			`# HELP wager_outbox_lag Current count of pending outbox messages\n# TYPE wager_outbox_lag gauge\nwager_outbox_lag ${snapshot.outboxLag}`,
			`# HELP wager_processing_latency_ms Summary of wager transaction processing duration in ms\n# TYPE wager_processing_latency_ms summary\nwager_processing_latency_ms{quantile="0.5"} ${snapshot.latency.p50Ms}\nwager_processing_latency_ms{quantile="0.95"} ${snapshot.latency.p95Ms}\nwager_processing_latency_ms{quantile="0.99"} ${snapshot.latency.p99Ms}\nwager_processing_latency_ms_sum ${snapshot.latency.sumMs}\nwager_processing_latency_ms_count ${snapshot.latency.count}`
		].join('\n') + '\n'
	);
};
