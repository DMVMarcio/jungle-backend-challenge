# Architecture Decisions

This document summarizes the technical design, architectural decisions, and trade-offs of the Distributed Wagering Processor.

---

## 1. System Design & Layering

The service follows Clean Architecture and Domain-Driven Design (DDD) principles:

- **Domain (`src/modules/*/domain`):** Pure business logic (`Wallet`, `WagerTransaction`), value objects (`Money`), domain integration events, domain errors, and repository interfaces. Completely decoupled from frameworks, ORMs, and transport protocols.
- **Application (`src/modules/*/application`):** Use cases orchestrating domain state transitions, transactional database boundaries, and outbox event dispatch.
- **Infrastructure (`src/modules/*/infrastructure`, `src/core/*`):** PostgreSQL persistence (MikroORM v7), AWS SQS FIFO queues, background workers, and external adapters.
- **Presentation (`src/modules/*/presentation`):** Fastify controllers, Zod request validation pipes, and M2M authentication guards.
- **Shared & Core (`src/shared`, `src/core`):** Cross-cutting primitives (ID generation, canonical SHA-256 payload hasher, structured logging, Prometheus metrics, health checks, settings).

Dependencies point strictly inward. Persistence and messaging are swappable infrastructure details.

---

## 2. Financial Precision & Ledger Integrity

- **Monetary Representation:** Native floating-point numbers (`number`, `float`, `double`) are strictly prohibited. The `Money` value object encapsulates `decimal.js`, enforcing:
  - Fixed-scale 2 decimal strings matching `/^\d+\.\d{2}$/` (e.g. `"100.00"`).
  - Valid ISO-4217 3-letter uppercase currency codes matching `/^[A-Z]{3}$/` (e.g. `"BRL"`, `"USD"`).
  - Immutability and strict currency matching across all arithmetic operations.
- **Append-Only Ledger:** Balance mutations produce immutable `WalletLedgerEntry` records. The PostgreSQL trigger `prevent_ledger_mutation` blocks any `UPDATE` or `DELETE`.
- **Database Constraints:**
  - `CHECK (amount > 0)` and `CHECK (balance_after >= 0)` on `wallet_ledger_entries`.
  - Arithmetic consistency check: `CHECK ((direction = 'CREDIT' AND balance_after = balance_before + amount) OR (direction = 'DEBIT' AND balance_after = balance_before - amount))`.
  - `UNIQUE (wallet_id, transaction_id)` preventing duplicate ledger entries.
  - Foreign key integrity referencing `wallets(id)`.
  - Partial unique index `uq_wager_tx_single_reversal` on `wager_transactions(reference_transaction_id)` WHERE `status = 'PROCESSED' AND kind IN ('REFUND', 'ROLLBACK')`, preventing cross-kind double reversal (`REFUND` + `ROLLBACK`).
- **Audit & Reconciliation:** `ReconcileWalletUseCase` verifies `wallet.balance == sum(ledger_entries)`. Discrepancies are logged as warnings and tracked via the Prometheus counter `wager_reconciliation_discrepancies_total`.

---

## 3. Concurrency & Locking Strategy

- **Pessimistic Row-Level Locking:** To prevent lost updates and negative balances across distributed instances, `ProcessWagerTransactionUseCase` acquires an exclusive row lock within an explicit database transaction:
  ```sql
  SELECT * FROM wallets WHERE id = $1 FOR UPDATE;
  ```
  Locks are strictly scoped to `walletId`. Transactions touching different wallets execute in parallel without contention.
- **Multi-Instance Idempotency Races:** When identical requests arrive simultaneously with the same `idempotencyKey`, competing connections may bypass initial reads before the first transaction commits. When subsequent inserts collide, PostgreSQL raises a unique constraint violation (`23505`). The use case catches this error, clears the entity manager context, fetches the committed record, and returns an idempotent replay (`idempotentReplay: true`).
- **Worker Non-Blocking Concurrency (`SKIP LOCKED`):** Both `OutboxPublisherWorker` and `PendingReferenceWorker` query pending batches using `FOR UPDATE SKIP LOCKED` (`LockMode.PESSIMISTIC_PARTIAL_WRITE`), allowing multiple replicas to process concurrently without contention or duplicate execution.

---

## 4. Persistence & ORM Decisions (MikroORM v7 & PostgreSQL 17)

- **ORM Choice Rationale:** MikroORM was chosen over TypeORM and Prisma because:
  - It implements the Unit of Work and Identity Map patterns, tracking modified entities within an explicit transaction boundary and avoiding premature database writes.
  - Native support for pessimistic locks (`LockMode.PESSIMISTIC_WRITE`, `LockMode.PESSIMISTIC_PARTIAL_WRITE`).
  - First-class support for explicit, reversible TypeScript migrations (`migrations/`).
  - Dynamic runtime configuration via `forRootAsync`, enabling ephemeral test containers without environment file tampering.
- **Transactional Scope:** `EntityManager.transactional()` guarantees ACID transactions. Any unhandled exception triggers an automatic SQL rollback.

---

## 5. Idempotency & Canonical Payload Hashing

- **Canonical Hashing Algorithm:** Incoming payloads are normalized to guarantee deterministic SHA-256 hashes regardless of JSON formatting or key ordering:
  1. Business fields are extracted: `providerId`, `externalTransactionId`, `playerId`, `walletId`, `roundId`, `gameId`, `kind`, `amount`, `currency`, and `referenceExternalTransactionId` (if present).
  2. Object keys are sorted recursively in alphabetical order.
  3. Primitive values are converted deterministically and whitespace is eliminated.
  4. Hashed using SHA-256 (`crypto.createHash('sha256').update(canonicalString).digest('hex')`).
- **Header Enforcement:** The `Idempotency-Key` HTTP header is mandatory on wagering requests (`400 Bad Request` if omitted) and must match the body key, preventing misrouting across proxy caches.
- **Idempotency Behavior:**
  - Identical key + identical hash: Returns the existing transaction state with `idempotentReplay: true` (HTTP 200).
  - Identical key + different hash: Throws `IdempotencyConflictError` (HTTP 409 Conflict).

---

## 6. HTTP Status Codes & Business Failure Mapping

The API strictly distinguishes validation errors, idempotency conflicts, business rejections, pending states, and infrastructure failures:

| HTTP Status | Condition / Domain Error | Resulting Status / Failure Code | Retry Strategy |
|---|---|---|---|
| **200 OK** | Successful operation execution or idempotent replay | `status: "PROCESSED"`, `idempotentReplay: true/false` | Completed. Do not retry. |
| **202 Accepted** | Out-of-order `REFUND`, `ROLLBACK` or `WIN` waiting for reference `BET` | `status: "PENDING_REFERENCE"` | Accepted. Poll status via GET. |
| **400 Bad Request** | Schema validation error, missing or mismatched `Idempotency-Key` header | Schema validation details | Fix payload before retrying. |
| **401 Unauthorized** | Missing or invalid Bearer token in production mode | Unauthorized error | Refresh token and retry. |
| **403 Forbidden** | Provider anti-spoofing mismatch or `WalletOwnershipError` | Forbidden error | Fix credentials / ownership. |
| **404 Not Found** | Target wallet not found | `WalletNotFoundError` | Non-retryable without creating wallet. |
| **409 Conflict** | Same `idempotencyKey` submitted with different payload / canonical hash | `IdempotencyConflictError` | Non-retryable. Generate a new key. |
| **422 Unprocessable** | Debit would exceed wallet balance | `failureCode: "INSUFFICIENT_FUNDS"` | Non-retryable unless balance increases. |
| **422 Unprocessable** | Currency does not match target wallet currency | `failureCode: "CURRENCY_MISMATCH"` | Non-retryable. Currency error. |
| **422 Unprocessable** | Reference transaction expired or not found | `failureCode: "REFERENCE_NOT_FOUND"` | Non-retryable without reference. |
| **422 Unprocessable** | Reference `BET` already reversed by earlier `REFUND` or `ROLLBACK` | `failureCode: "REFERENCE_ALREADY_REVERSED"` | Non-retryable. Double reversal blocked. |
| **422 Unprocessable** | Reference context mismatch (provider, player, wallet, round, currency) | `failureCode: "REFERENCE_CONTEXT_MISMATCH"` | Non-retryable. Fix reference params. |
| **422 Unprocessable** | Reference not in PROCESSED status or invalid kind | `failureCode: "INVALID_REFERENCE_STATE"` / `"INVALID_REFERENCE_KIND"` | Non-retryable. Verify reference state. |
| **500 Internal Error** | Unhandled infrastructure failure (e.g. database unreachable) | Internal server error | Retryable with exponential backoff. |

---

## 7. Asynchronous Messaging (Transactional Outbox & Inbox)

- **Transactional Outbox:** Domain events (`WagerTransactionProcessed`, `WagerTransactionRejected`, `WalletBalanceChanged`, `WagerTransactionPendingReference`) are committed atomically within the database transaction alongside financial mutations. `OutboxPublisherWorker` polls via `FOR UPDATE SKIP LOCKED` and publishes to the dedicated events queue (`wager-events.fifo`). Messages are grouped by `MessageGroupId` (`walletId`), publishing sequentially within each group while distinct groups run concurrently to strictly guarantee FIFO order per wallet. Poison pills are bounded by `MAX_ATTEMPTS = 10`.
- **AWS SQS FIFO Queues:**
  - Commands on `wager-transactions.fifo`, events on `wager-events.fifo`, and dead-letters on `wager-transactions-dlq.fifo`.
  - `MessageGroupId = walletId` guarantees per-wallet ordering with parallel multi-wallet throughput.
  - `MessageDeduplicationId = id` leverages SQS deduplication within the 5-minute deduplication window.
- **Transactional Inbox & Consumer:** `SqsConsumerWorker` checks `inbox_messages` prior to execution. Redelivered messages (e.g. after a crash between database commit and SQS ack) are acknowledged and deleted without duplicate execution. Non-retryable deterministic domain errors route directly to DLQ.
- **Graceful Shutdown (`SIGTERM`):** Active processing loops complete, and remaining in-flight SQS messages have their visibility timeout immediately reset to 0 (`ChangeMessageVisibilityCommand({ VisibilityTimeout: 0 })`), allowing other replicas to resume without delay.

---

## 8. Out-of-Order Reference Handling

Wagering operations follow a state machine:
```text
BET -> WIN | LOSS | REFUND | ROLLBACK
```

When a dependent transaction (`REFUND`, `ROLLBACK` or out-of-order `WIN`) arrives before its referenced `BET`:
- The transaction transitions to `PENDING_REFERENCE` (HTTP 202) without mutating wallet balance or creating ledger entries.
- A scheduled worker (`PendingReferenceWorker`) periodically re-evaluates pending transactions filtered by `next_attempt_at <= now` using `FOR UPDATE SKIP LOCKED`.
- Worker manages retry state (`attempts`, `next_attempt_at`) directly in the database, ensuring resilience and coordination across multiple horizontal worker instances.
- Each pending item is evaluated in an isolated individual database transaction, eliminating cross-wallet lock contention and cascade rollbacks.
- Once the referenced transaction is committed, the worker completes the financial mutations and outbox event emissions.
- If the reference does not arrive within a 5-minute TTL, the transaction moves to terminal `REJECTED` status with `failureCode: 'REFERENCE_NOT_FOUND'`.

---

## 9. Provider Authentication (M2M)

- **Machine-to-Machine Context:** Exposes B2B endpoints for external game providers. Interactive player sessions are not applicable. In production, providers authenticate machine-to-machine via OAuth2 Client Credentials issuing signed JWTs verified against an IdP (e.g. Keycloak or Zitadel).
- **Extension Point:** Structured via Ports and Adapters:
  - Port: `IProviderIdentityPort`
  - Adapter: `ProviderIdentityAdapter` (parses `Authorization: Bearer <token>`)
  - Guard: `ProviderAuthGuard`
- **Anti-Spoofing:** Enforces that the authenticated token identity strictly matches the `providerId` declared in the payload or route parameters (`403 Forbidden` on mismatch).
- **Environment Behavior:** Permissive in dev and test environments when headers are omitted, enabling evaluation without token generation overhead. Production mode strictly enforces authorization headers (`401 Unauthorized`). Health check endpoints and SQS consumers bypass HTTP authentication.

---

## 10. Testing Strategy & Concurrency Proofs

The test suite validates the system through unit tests and real integration suites running against ephemeral Docker containers via `@testcontainers` (`postgres:17-alpine` and `localstack/localstack:3.8.1`).

### The 8 Mandatory Concurrency & Integration Scenarios (Section 13)

| # | Mandatory Scenario | Implementation & Verification | Result |
|---|---|---|---|
| **1** | Same bet sent 50x in parallel | 50 concurrent requests with identical key and payload against the same wallet. Exactly 1 debit occurs; 49 return `idempotentReplay: true`. | Verified |
| **2** | Balance contention on hot wallet | Concurrent bets exceeding initial balance (e.g. two R$ 80.00 bets against R$ 100.00 balance). Exactly 1 processed, other rejected with `INSUFFICIENT_FUNDS`. Balance never negative. | Verified |
| **3** | Distinct wallets in parallel | 5 independent wallets processed simultaneously under heavy concurrent loads. Proves zero lock contention across different wallets. | Verified |
| **4** | ≥ 3 simultaneous application instances | 3 independent NestJS contexts with separate entity managers competing for the same hot wallet. Validates row lock isolation and zero lost updates. | Verified |
| **5** | SQS worker crash post-commit and pre-ack | Message committed to PostgreSQL alongside `inbox_messages`, but crash simulated before SQS delete. Redelivered message recognized as processed via inbox; deleted without duplicate debit. | Verified |
| **6** | Multiple concurrent outbox publishers | 2 publisher workers running simultaneously over pending messages. `FOR UPDATE SKIP LOCKED` partitions messages cleanly; zero duplicate SQS emissions. | Verified |
| **7** | Out-of-order `REFUND` before reference `BET` | `REFUND` stored as `PENDING_REFERENCE`. Once reference `BET` is persisted, `PendingReferenceWorker` resolves the reversal, credits wallet, and updates ledger. | Verified |
| **8** | Service shutdown and restart | Process shutdown (`app.close()`), followed by boot of a new application context connected to the same database. Confirms complete state recovery and ledger consistency. | Verified |

**Universal Test Invariant:**
```text
wallet.balance == sum of all ledger entries
```
Verified in 100% of test runs.

---

## 11. Observability & Telemetry

- **Structured Logging & Tracing:** Emits single-line JSON logs with automatic sanitization of sensitive credentials (`token`, `password`, `secret`, `payload`). Context (`correlationId`, `messageId`, `walletId`, `providerId`) is propagated across async chains via `AsyncLocalStorage` and echoed in the `x-correlation-id` response header.
- **Prometheus Metrics (`GET /metrics`):** Standard exposition format (and JSON via `Accept: application/json`). Tracks transaction status, idempotent replays, worker retry counts, DLQ dispatches, database lock conflicts, outbox queue lag, reconciliation discrepancies (`wager_reconciliation_discrepancies_total`), and latency percentiles (p50, p95, p99).
- **Health Probes:** `GET /health/live` (process liveness) and `GET /health/ready` (validates PostgreSQL and LocalStack SQS connectivity).

---

## 12. Load Testing & Performance Benchmark

Executed via `bun run test:load` (creates test wallets, fires concurrent mixed `BET`/`WIN`/`REFUND` transactions, and validates 100% financial consistency via ledger reconciliation):

| Metric | Result (Single Bun Process) | Architectural Invariant |
|---|---|---|
| **Workload** | 300 mixed operations / 10 wallets | Concurrency: 20 parallel workers |
| **Throughput** | ~70–100 req/s | End-to-end across PostgreSQL & SQS |
| **Latency** | p50: ~200ms \| p95: ~580ms \| p99: ~720ms | Includes row locks & outbox persistence |
| **Error Rate** | 0% 5xx infrastructure errors | Only business responses (200, 202, 422) |
| **Financial Integrity** | 100% reconciled (0 discrepancies) | Strict prevention of negative balance |
| **Outbox Backlog** | Lag drained to 0 messages | At-least-once FIFO delivery confirmed |

---

## 13. Key Trade-offs

| Decision | Benefit | Trade-off |
|---|---|---|
| **Pessimistic Row Lock (`SELECT FOR UPDATE`)** | Guarantees strict financial consistency and prevents negative balances. | Contention on single "hot wallets" if a player generates bursts of requests. |
| **Scheduled Outbox Polling** | Robust at-least-once delivery without external database CDC plugins. | Publication latency bounded by polling interval (1s). |
| **SQS FIFO Message Grouping** | Preserves per-wallet transaction ordering. | Throughput capped by SQS FIFO per-group limits (300-3,000 msg/s with batching). |
| **Out-of-Order TTL Polling** | Resilient against network delays across distributed providers. | Requires polling worker overhead; clients query transaction status asynchronously if reference is delayed. |
| **Permissive Auth in Development** | Zero friction for manual testing and evaluation. | Requires strict verification of `NODE_ENV=production` during production deployments. |
