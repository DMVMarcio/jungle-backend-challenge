import { Migration } from '@mikro-orm/migrations';

export class Migration20261027152151 extends Migration {

  override name = 'Migration20261027152151';

  override up(): void | Promise<void> {
    this.addSql(`create table "inbox_messages" ("message_id" varchar(255) not null, "consumer_name" varchar(255) not null, "payload_hash" varchar(255) not null, "received_at" timestamptz not null default CURRENT_TIMESTAMP, "processed_at" timestamptz null, primary key ("message_id", "consumer_name"));`);

    this.addSql(`create table "outbox_messages" ("id" uuid not null, "aggregate_id" varchar(255) not null, "event_type" varchar(255) not null, "payload" jsonb not null, "occurred_at" timestamptz not null default CURRENT_TIMESTAMP, "attempts" int not null default 0, "next_attempt_at" timestamptz null, "published_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "outbox_messages_aggregate_id_index" on "outbox_messages" ("aggregate_id");`);
    this.addSql(`create index "outbox_messages_published_at_next_attempt_at_index" on "outbox_messages" ("published_at", "next_attempt_at");`);

    this.addSql(`create table "wager_transactions" ("id" uuid not null, "provider_id" varchar(255) not null, "external_transaction_id" varchar(255) not null, "idempotency_key" varchar(255) not null, "payload_hash" varchar(255) not null, "wallet_id" uuid not null, "player_id" uuid not null, "round_id" varchar(255) not null, "game_id" varchar(255) not null, "kind" text not null, "amount" numeric(18, 2) not null, "currency" varchar(255) not null, "reference_external_transaction_id" varchar(255) null, "reference_transaction_id" uuid null, "status" text not null, "failure_code" varchar(255) null, "created_at" timestamptz not null default CURRENT_TIMESTAMP, "processed_at" timestamptz null, primary key ("id"));`);
    this.addSql(`alter table "wager_transactions" add constraint "wager_transactions_idempotency_key_unique" unique ("idempotency_key");`);
    this.addSql(`create index "wager_transactions_wallet_id_index" on "wager_transactions" ("wallet_id");`);
    this.addSql(`create index "wager_transactions_player_id_index" on "wager_transactions" ("player_id");`);
    this.addSql(`create index "wager_transactions_status_index" on "wager_transactions" ("status");`);
    this.addSql(`create index "wager_transactions_provider_id_reference_external__48426_index" on "wager_transactions" ("provider_id", "reference_external_transaction_id");`);
    this.addSql(`create index "wager_transactions_wallet_id_round_id_index" on "wager_transactions" ("wallet_id", "round_id");`);
    this.addSql(`alter table "wager_transactions" add constraint "wager_transactions_provider_id_external_transaction_id_unique" unique ("provider_id", "external_transaction_id");`);

    this.addSql(`alter table "wager_transactions" add constraint "wager_transactions_kind_check" check ("kind" in ('OPENING', 'BET', 'WIN', 'LOSS', 'REFUND', 'ROLLBACK'));`);
    this.addSql(`alter table "wager_transactions" add constraint "wager_transactions_status_check" check ("status" in ('PENDING', 'PENDING_REFERENCE', 'PROCESSED', 'REJECTED', 'FAILED'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "inbox_messages" cascade;`);
    this.addSql(`drop table if exists "outbox_messages" cascade;`);
    this.addSql(`drop table if exists "wager_transactions" cascade;`);
  }

}
