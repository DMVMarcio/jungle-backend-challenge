interface LoadTestConfig {
	baseUrl: string;
	totalWallets: number;
	initialBalance: string;
	operationsPerWallet: number;
	concurrency: number;
	providerId: string;
}

interface RequestRecord {
	status: number;
	durationMs: number;
	kind: string;
	error?: string;
	isReplay?: boolean;
	txStatus?: string;
}

interface WalletContext {
	walletId: string;
	playerId: string;
	betExternalIds: string[];
}

const config: LoadTestConfig = {
	baseUrl: process.env.APP_URL || 'http://127.0.0.1:3000',
	totalWallets: Number(process.env.LOAD_WALLETS || 10),
	initialBalance: '5000.00',
	operationsPerWallet: Number(process.env.LOAD_OPS_PER_WALLET || 30),
	concurrency: Number(process.env.LOAD_CONCURRENCY || 20),
	providerId: 'load-test-provider'
};

const post = async (url: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> => {
	return fetch(`${config.baseUrl}${url}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${config.providerId}`,
			...headers
		},
		body: JSON.stringify(body)
	});
};

const get = async (url: string, headers: Record<string, string> = {}): Promise<Response> => {
	return fetch(`${config.baseUrl}${url}`, {
		method: 'GET',
		headers: { Authorization: `Bearer ${config.providerId}`, ...headers }
	});
};

const executeTimedTransaction = async (
	kind: string,
	payload: Record<string, unknown>,
	idempotencyKey: string
): Promise<RequestRecord> => {
	const start = performance.now();
	try {
		const res = await post('/wagering/transactions', payload, { 'Idempotency-Key': idempotencyKey });
		const durationMs = performance.now() - start;
		const json = (await res.json().catch(() => ({}))) as { status?: string; idempotentReplay?: boolean };
		return { status: res.status, durationMs, kind, txStatus: json.status, isReplay: json.idempotentReplay };
	} catch (err) {
		return { status: 0, durationMs: performance.now() - start, kind, error: (err as Error).message };
	}
};

const checkReadiness = async (): Promise<boolean> => {
	try {
		const res = await get('/health/ready');
		return res.ok;
	} catch {
		return false;
	}
};

const createWallets = async (): Promise<WalletContext[]> => {
	const wallets: WalletContext[] = [];
	for (let i = 0; i < config.totalWallets; i++) {
		const playerId = crypto.randomUUID();
		const res = await post('/wallets', {
			playerId,
			initialBalance: { amount: config.initialBalance, currency: 'BRL' }
		});

		if (!res.ok) {
			console.error(`Failed to create wallet ${i + 1}: ${res.status}`);
			process.exit(1);
		}

		const data = (await res.json()) as { id: string };
		wallets.push({ walletId: data.id, playerId, betExternalIds: [] });
	}
	return wallets;
};

const generateTasks = (wallets: WalletContext[]): (() => Promise<RequestRecord>)[] => {
	const tasks: (() => Promise<RequestRecord>)[] = [];

	for (const wallet of wallets) {
		for (let op = 0; op < config.operationsPerWallet; op++) {
			const roundId = `round-${wallet.walletId.slice(0, 8)}-${Math.floor(op / 3)}`;
			const externalTxId = `load-tx-${crypto.randomUUID()}`;
			const idempotencyKey = `${config.providerId}:${externalTxId}`;
			const basePayload = {
				providerId: config.providerId,
				externalTransactionId: externalTxId,
				playerId: wallet.playerId,
				walletId: wallet.walletId,
				roundId,
				gameId: 'load-game'
			};

			if (op % 5 === 0 && wallet.betExternalIds.length > 0) {
				const refId = wallet.betExternalIds[wallet.betExternalIds.length - 1];
				tasks.push(() =>
					executeTimedTransaction(
						'REFUND',
						{
							...basePayload,
							kind: 'REFUND',
							money: { amount: '10.00', currency: 'BRL' },
							referenceExternalTransactionId: refId
						},
						idempotencyKey
					)
				);
			} else if (op % 3 === 0 && wallet.betExternalIds.length > 0) {
				tasks.push(() =>
					executeTimedTransaction(
						'WIN',
						{ ...basePayload, kind: 'WIN', money: { amount: '20.00', currency: 'BRL' } },
						idempotencyKey
					)
				);
			} else {
				wallet.betExternalIds.push(externalTxId);
				tasks.push(() =>
					executeTimedTransaction(
						'BET',
						{ ...basePayload, kind: 'BET', money: { amount: '10.00', currency: 'BRL' } },
						idempotencyKey
					)
				);
			}
		}
	}

	return tasks.sort(() => Math.random() - 0.5);
};

const runWorkers = async (tasks: (() => Promise<RequestRecord>)[], concurrency: number): Promise<RequestRecord[]> => {
	const results: RequestRecord[] = [];
	let cursor = 0;

	const worker = async () => {
		while (cursor < tasks.length) {
			const task = tasks[cursor++];
			if (!task) break;
			results.push(await task());
		}
	};

	await Promise.all(Array.from({ length: concurrency }, () => worker()));
	return results;
};

const reconcileWallets = async (wallets: WalletContext[]): Promise<{ reconciled: number; inconsistencies: number }> => {
	let reconciled = 0;
	let inconsistencies = 0;

	for (const wallet of wallets) {
		const res = await post(`/wallets/${wallet.walletId}/reconciliation`, {});
		if (res.ok) {
			const rec = (await res.json()) as { consistent: boolean; difference: { amount: string } };
			if (rec.consistent && rec.difference.amount === '0.00') {
				reconciled++;
			} else {
				inconsistencies++;
			}
		} else {
			inconsistencies++;
		}
	}

	return { reconciled, inconsistencies };
};

const printReport = (
	results: RequestRecord[],
	durationSeconds: number,
	walletsCount: number,
	reconciled: number,
	inconsistencies: number,
	metrics: Record<string, unknown>
): void => {
	const total = results.length;
	const rps = Number((total / durationSeconds).toFixed(2));
	const latencies = results.map(r => r.durationMs).sort((a, b) => a - b);
	const percentile = (p: number) => (latencies[Math.floor(latencies.length * p)] ?? 0).toFixed(2);
	const avg = (latencies.reduce((a, b) => a + b, 0) / (latencies.length || 1)).toFixed(2);
	const errors = results.filter(r => r.status >= 500 || r.status === 0).length;

	console.log('\n================ LOAD TEST REPORT ================');
	console.log(`Requests: ${total} | Duration: ${durationSeconds.toFixed(2)}s | Throughput: ${rps} req/s`);
	console.log(
		`Success Rate: ${((1 - errors / total) * 100).toFixed(2)}% | Error Rate: ${((errors / total) * 100).toFixed(2)}%`
	);
	console.log(
		`Latency (ms): min=${(latencies[0] ?? 0).toFixed(2)} | avg=${avg} | p50=${percentile(0.5)} | p95=${percentile(0.95)} | p99=${percentile(0.99)} | max=${(latencies[latencies.length - 1] ?? 0).toFixed(2)}`
	);
	console.log(
		`Financial Reconciliation: ${reconciled}/${walletsCount} consistent (${inconsistencies} discrepancies)`
	);
	console.log(
		`Server Telemetry: lock_conflicts=${metrics.lockConflicts ?? 0} | outbox_lag=${metrics.outboxLag ?? 0}`
	);
	console.log('==================================================\n');
};

const run = async () => {
	console.log(`Starting Distributed Wagering Processor Load Test [concurrency: ${config.concurrency}]`);

	if (!(await checkReadiness())) {
		console.error(`Service at ${config.baseUrl} is not ready. Ensure Docker and the application are running.`);
		process.exit(1);
	}

	console.log(`Creating ${config.totalWallets} test wallets with initial balance ${config.initialBalance} BRL...`);
	const wallets = await createWallets();

	console.log(
		`Executing ${config.totalWallets * config.operationsPerWallet} operations across ${config.concurrency} parallel workers...`
	);
	const tasks = generateTasks(wallets);
	const start = performance.now();
	const results = await runWorkers(tasks, config.concurrency);
	const durationSeconds = (performance.now() - start) / 1000;

	console.log(`Reconciling all ${wallets.length} wallets against append-only ledger...`);
	const { reconciled, inconsistencies } = await reconcileWallets(wallets);

	const metricsRes = await get('/metrics', { Accept: 'application/json' });
	const metrics = metricsRes.ok ? ((await metricsRes.json()) as Record<string, unknown>) : {};

	printReport(results, durationSeconds, wallets.length, reconciled, inconsistencies, metrics);

	if (inconsistencies > 0) {
		console.error(`TEST FAILED: ${inconsistencies} financial discrepancies detected.`);
		process.exit(1);
	}
};

run().catch(err => {
	console.error('Fatal load test error:', err);
	process.exit(1);
});
