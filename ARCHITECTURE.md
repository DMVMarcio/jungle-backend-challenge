# Architecture Decisions

This document summarizes the technical design, architectural decisions, and trade-offs of the Distributed Wagering Processor.

---

## 1. System Design & Layering

The service follows Clean Architecture and Domain-Driven Design (DDD) principles:

- **Domain (`src/modules/*/domain`):** Pure business logic and aggregates (`Wallet`, `WagerTransaction`), value objects (`Money`), domain errors, and repository interfaces. Free of framework or ORM dependencies.
- **Application (`src/modules/*/application`):** Use cases coordinating domain state, transactional boundaries, and outbox event dispatch.
- **Infrastructure (`src/modules/*/infrastructure`, `src/core/*`):** MikroORM repositories, background workers, SQS clients, and external adapters.
- **Presentation (`src/modules/*/presentation`):** Fastify controllers, Zod request validation pipes, and authentication guards.
- **Shared & Core (`src/shared`, `src/core`):** Cross-cutting utilities (ID generation, SHA-256 payload hasher, health checks, settings).

Dependencies point inward. The domain model remains completely decoupled from transport protocols and persistence mechanisms.

---

## 2. Financial Precision & Ledger Integrity

- **Monetary Representation:** Native floating-point numbers (`number`, `float`) are strictly forbidden. The `Money` value object (`src/shared/domain/money/money.ts`) wraps `decimal.js`, accepts and serializes fixed-scale 2 decimal strings (e.g. `"100.00"`), enforces immutability, and blocks operations across mismatched currencies.
- **Schema Constraints:** Database tables enforce precision at the schema level using `numeric(18, 2)` and check constraints (`CHECK balance_amount >= 0` on `wallets`).
- **Append-Only Ledger:** Balance mutations must produce a balanced `WalletLedgerEntry` recording direction (`CREDIT` or `DEBIT`), amount, and exact `balanceBefore` and `balanceAfter` snapshots. Ledger records are immutable (no updates or deletes).
- **Reconciliation:** The `ReconcileWalletUseCase` sums all ledger entries for a wallet and compares the computed sum against the materialized balance to verify mathematical consistency.

---

## 3. Concurrency & Locking Strategy

- **Pessimistic Row-Level Locking:** To prevent lost updates and race conditions across multiple application instances, `ProcessWagerTransactionUseCase` acquires an exclusive row lock on the target wallet:
  ```sql
  SELECT * FROM wallets WHERE id = $1 FOR UPDATE;
  ```
  Locks are strictly scoped to `walletId`. Transactions touching different wallets execute in parallel without contention.
- **Concurrent Idempotency Race Resolution:** When identical requests arrive simultaneously with the same `idempotencyKey`, competing PostgreSQL connections may bypass initial reads before the first transaction commits. When subsequent inserts collide, PostgreSQL raises a unique constraint violation (`23505` / `UniqueConstraintViolationException`). The use case intercepts this error, clears the entity manager context, fetches the committed record, and returns an idempotent replay response (`idempotentReplay: true`).

---

## 4. Persistence (MikroORM v7)

- **Unit of Work & Identity Map:** Tracks modified entities within a transactional boundary and ensures entity reference consistency across repository calls.
- **Transactional Scope:** `EntityManager.transactional()` guarantees ACID transactions. Any unhandled failure triggers an automatic SQL rollback.
- **Dynamic Configuration:** Database connectivity uses `forRootAsync`, allowing runtime URL overriding for ephemeral test containers without modifying local environment files.
- **Explicit Migrations:** Database schema versioning is managed via explicit, reversible migrations (`migrations/`) executed deterministically at startup.

---

## 5. Idempotency & Conflict Detection

- **Canonical Payload Hash:** Requests are normalized and hashed using SHA-256 (`payloadHash`).
- **Conflict Handling:**
  - Identical `idempotencyKey` + identical `payloadHash`: Returns the existing transaction state with `idempotentReplay: true`.
  - Identical `idempotencyKey` + different `payloadHash`: Throws `IdempotencyConflictError` (`409 Conflict`), preventing payload substitution attacks.

---

## 6. Asynchronous Messaging (Outbox & Inbox)

### Transactional Outbox
- Outbox records (`outbox_messages`) are written within the exact same database transaction as the wallet balance and ledger entries.
- The `OutboxPublisherWorker` polls pending messages using:
  ```sql
  SELECT * FROM outbox_messages 
  WHERE published_at IS NULL AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
  ORDER BY occurred_at ASC 
  LIMIT 50 
  FOR UPDATE SKIP LOCKED;
  ```
  `SKIP LOCKED` allows multiple publisher workers to scale horizontally without duplicate message delivery or database deadlocks.

### AWS SQS FIFO
- Messages are published to `wager-transactions.fifo`.
- `MessageGroupId = aggregateId` (`walletId`): Guarantees strict sequential processing per wallet while allowing independent wallets to process concurrently.
- `MessageDeduplicationId = id`: Leverages SQS deduplication within the 5-minute deduplication window.

### Transactional Inbox & Dead-Letter Queue
- The `SqsConsumerWorker` checks `inbox_messages` prior to execution.
- If already processed, the message is acknowledged and deleted from the queue immediately.
- For new messages, the inbox entry is committed atomically alongside the wagering operation.
- Queue deletion (`DeleteMessageCommand`) occurs only after a successful SQL commit.
- Malformed payloads or messages exceeding 5 retries (`ApproximateReceiveCount >= 5`) are forwarded to `wager-transactions-dlq.fifo`.

---

## 7. Out-of-Order Reference Handling

Wagering operations follow a state machine:
```text
BET -> WIN | LOSS | REFUND | ROLLBACK
```

When a dependent transaction (`REFUND` or `ROLLBACK`) arrives before its referenced `BET`:
- The transaction transitions to `PENDING_REFERENCE` rather than failing with an error.
- A scheduled worker (`PendingReferenceWorker`) periodically re-evaluates pending transactions.
- Once the referenced transaction is committed, the worker completes the financial reversal.
- If the reference does not arrive within a 5-minute TTL, the transaction moves to terminal `REJECTED` status with `failureCode: 'REFERENCE_NOT_FOUND'`.

---

## 8. Provider Authentication (M2M)

- **Machine-to-Machine Context:** This service exposes B2B endpoints for external game providers. Interactive player sessions (cookies, session stores) are not applicable. In production, providers authenticate machine-to-machine via OAuth2 Client Credentials issuing signed JWTs verified against an IdP (e.g. Keycloak or Zitadel).
- **Extension Point:** Structured via Ports and Adapters:
  - Port: `IProviderIdentityPort`
  - Adapter: `ProviderIdentityAdapter` (parses `Authorization: Bearer <token>`)
  - Guard: `ProviderAuthGuard`
- **Anti-Spoofing:** Enforces that the authenticated token identity strictly matches the `providerId` declared in the payload or route parameters. Mismatched requests are rejected with `403 Forbidden`.
- **Environment Behavior:** Operates permissively in development and test environments when headers are omitted, enabling evaluation via cURL, Postman, and automated tests without token generation overhead. Production mode strictly enforces authorization headers (`401 Unauthorized`).
- **Channel Isolation:** Health check endpoints (`/health/live`, `/health/ready`) and internal SQS consumer workers bypass HTTP authentication as specified.

---

## 9. Testing Strategy

- **Unit Tests:** Validate isolated domain logic, `Money` arithmetic, state transitions, ledger integrity, and guard rules.
- **Integration & Concurrency Tests:** Run against ephemeral Docker containers via `@testcontainers` (`postgres:17-alpine` and `localstack/localstack:3.8.1`). Containers boot dynamically, run migrations, execute test suites, and tear down automatically.
- **Core Scenarios Verified:**
  - 2 simultaneous R$ 80.00 bets against a R$ 100.00 balance -> exactly 1 processed, 1 rejected (`INSUFFICIENT_FUNDS`), R$ 20.00 final balance, and consistent reconciliation.
  - Burst of 50 concurrent identical requests -> exactly 1 debit, 49 idempotent replays, zero 500 errors.
  - Burst of 10 distinct concurrent bets -> zero negative balance.
  - Transactional outbox commit and real LocalStack SQS FIFO message delivery.

---

## 10. Observability & Telemetry

- **Structured Logging & Tracing:** Emits single-line JSON logs with automatic sanitization of sensitive credentials (`token`, `password`, `secret`, `payload`). Context (`correlationId`, `messageId`, `walletId`, `providerId`) is propagated across async chains via `AsyncLocalStorage` and echoed in the `x-correlation-id` response header.
- **Prometheus Metrics (`GET /metrics`):** Standard exposition format (and JSON via `Accept: application/json`). Tracks transaction status, idempotent replays, worker retry counts, DLQ dispatches, database lock conflicts, outbox queue lag, and latency percentiles (p50, p95, p99).
- **Health Probes:** `GET /health/live` (process liveness) and `GET /health/ready` (validates PostgreSQL and LocalStack SQS connectivity).

---

## 11. Load Testing & Performance Benchmark

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

## 12. Key Trade-offs

| Decision | Benefit | Trade-off |
|---|---|---|
| **Pessimistic Row Lock (`SELECT FOR UPDATE`)** | Guarantees strict financial consistency and prevents negative balances. | High contention on single "hot wallets" if a player generates bursts of requests. |
| **Scheduled Outbox Polling** | Robust at-least-once delivery without external database CDC plugins. | Publication latency bounded by polling interval (1-2s). |
| **SQS FIFO Message Grouping** | Preserves per-wallet transaction ordering. | Throughput capped by SQS FIFO per-group limits (300-3,000 msg/s with batching). |
| **Out-of-Order TTL Polling** | Resilient against network delays across distributed providers. | Requires polling worker overhead; clients must query transaction status asynchronously if reference is delayed. |
| **Permissive Auth in Development** | Zero friction for manual testing and evaluation. | Requires strict verification of `NODE_ENV=production` during production deployments. |
