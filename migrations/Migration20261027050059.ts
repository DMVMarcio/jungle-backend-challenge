import { Migration } from '@mikro-orm/migrations';

export class Migration20261027050059 extends Migration {

  override name = 'Migration20261027050059';

  override up(): void | Promise<void> {
    this.addSql(`create table "wallets" ("id" uuid not null, "player_id" uuid not null, "balance_amount" numeric(18, 2) not null, "currency" varchar(255) not null, "version" int not null default 1, "created_at" timestamptz not null default CURRENT_TIMESTAMP, "updated_at" timestamptz not null default CURRENT_TIMESTAMP, primary key ("id"));`);
    this.addSql(`alter table "wallets" add constraint "wallets_player_id_currency_unique" unique ("player_id", "currency");`);

    this.addSql(`create table "wallet_ledger_entries" ("id" uuid not null, "wallet_id" uuid not null, "transaction_id" varchar(255) not null, "direction" text not null, "amount" numeric(18, 2) not null, "balance_before" numeric(18, 2) not null, "balance_after" numeric(18, 2) not null, "currency" varchar(255) not null, "created_at" timestamptz not null default CURRENT_TIMESTAMP, primary key ("id"));`);
    this.addSql(`create index "wallet_ledger_entries_wallet_id_index" on "wallet_ledger_entries" ("wallet_id");`);
    this.addSql(`create index "wallet_ledger_entries_transaction_id_index" on "wallet_ledger_entries" ("transaction_id");`);
    this.addSql(`create index "wallet_ledger_entries_created_at_index" on "wallet_ledger_entries" ("created_at");`);
    this.addSql(`create index "wallet_ledger_entries_wallet_id_created_at_index" on "wallet_ledger_entries" ("wallet_id", "created_at");`);

    this.addSql(`alter table "wallets" add constraint "wallets_balance_amount_check" check (balance_amount >= 0);`);

    this.addSql(`alter table "wallet_ledger_entries" add constraint "wallet_ledger_entries_direction_check" check ("direction" in ('DEBIT', 'CREDIT'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "wallets" cascade;`);
    this.addSql(`drop table if exists "wallet_ledger_entries" cascade;`);
  }

}
