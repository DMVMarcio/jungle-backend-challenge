# Distributed Wagering Processor

A distributed financial service built with Bun, NestJS, and PostgreSQL that processes wagering transactions from multiple game providers with strict financial accuracy, persistent idempotency, transactional outbox/inbox messaging, and pessimistic concurrency control.

---

## Tech Stack

- **Runtime:** Bun 1.x
- **Language:** TypeScript (strict mode)
- **Framework:** NestJS (Fastify adapter)
- **Database:** PostgreSQL 17 (MikroORM v7)
- **Messaging:** AWS SQS FIFO (LocalStack 3.8.1)
- **Testing:** Bun Test Runner with Testcontainers

---

## Prerequisites

- [Bun](https://bun.sh/) 1.x
- [Docker](https://www.docker.com/) and Docker Compose

---

## Getting Started

### 1. Install Dependencies

```bash
bun install
```

### 2. Start Infrastructure

Start the local PostgreSQL and LocalStack (SQS) containers:

```bash
docker compose up -d
```

### 3. Run Database Migrations

Apply database schema migrations to PostgreSQL:

```bash
bun run migration:up
```

### 4. Start the Application

Development mode (with file watcher):
```bash
bun run dev
```

Production mode:
```bash
bun run start
```

The HTTP server will be available at `http://localhost:3000`.

---

## Running Tests

Integration and concurrency tests run against isolated, ephemeral Docker containers provisioned dynamically via `@testcontainers` (PostgreSQL 17 and LocalStack SQS). Running tests does not require pre-existing Docker containers or database state.

### Run Test Suite

```bash
bun test
```

### Run Type Checking

```bash
bun run typecheck
```

---

## API Overview

### Health Checks
- `GET /health/live` — Service liveness probe.
- `GET /health/ready` — Service readiness probe (checks PostgreSQL and SQS connectivity).

### Wallets
- `POST /wallets` — Opens a new player wallet with optional initial balance.
- `GET /wallets/:walletId` — Retrieves current wallet balance and version.
- `GET /wallets/:walletId/ledger` — Retrieves cursor-paginated ledger entries.
- `POST /wallets/:walletId/reconciliation` — Audits stored balance against the sum of all historical ledger entries.

### Wagering
- `POST /wagering/transactions` — Processes a wagering transaction (`BET`, `WIN`, `LOSS`, `REFUND`, `ROLLBACK`). Supports idempotency via `idempotency-key` header and Bearer token provider authentication.
- `GET /wagering/transactions/:transactionId` — Retrieves a transaction by internal UUID.
- `GET /providers/:providerId/wagering/transactions/:externalTransactionId` — Retrieves a transaction by provider and external reference.

---

## Documentation

- [Architecture Decisions (ARCHITECTURE.md)](ARCHITECTURE.md) — Detailed rationale on financial precision, locking strategy, transactional outbox/inbox, and trade-offs.
- [Challenge Specification (CHALLENGE.md)](CHALLENGE.md) — Original technical challenge requirements.
