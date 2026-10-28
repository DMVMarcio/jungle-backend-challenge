import { Migration } from '@mikro-orm/migrations';

export class Migration20261028194500 extends Migration {
	override name = 'Migration20261028194500';

	override up(): void | Promise<void> {
		this.addSql(
			`alter table "wallet_ledger_entries" add constraint "wallet_ledger_entries_wallet_id_transaction_id_unique" unique ("wallet_id", "transaction_id");`
		);
		this.addSql(
			`alter table "wallet_ledger_entries" add constraint "wallet_ledger_entries_amount_check" check ("amount" > 0);`
		);
		this.addSql(
			`alter table "wallet_ledger_entries" add constraint "wallet_ledger_entries_balance_after_check" check ("balance_after" >= 0);`
		);
		this.addSql(
			`alter table "wallet_ledger_entries" add constraint "wallet_ledger_entries_arithmetic_check" check (("direction" = 'CREDIT' and "balance_after" = "balance_before" + "amount") or ("direction" = 'DEBIT' and "balance_after" = "balance_before" - "amount"));`
		);

		this.addSql(
			`alter table "wallet_ledger_entries" add constraint "wallet_ledger_entries_wallet_id_foreign" foreign key ("wallet_id") references "wallets" ("id") on update cascade on delete restrict;`
		);
		this.addSql(
			`alter table "wager_transactions" add constraint "wager_transactions_wallet_id_foreign" foreign key ("wallet_id") references "wallets" ("id") on update cascade on delete restrict;`
		);

		this.addSql(`create or replace function prevent_ledger_mutation()
returns trigger as $$
begin
	raise exception 'wallet_ledger_entries is append-only: updates and deletes are forbidden';
end;
$$ language plpgsql;`);

		this.addSql(`create trigger trg_prevent_wallet_ledger_mutation
before update or delete on wallet_ledger_entries
for each row execute function prevent_ledger_mutation();`);

		this.addSql(
			`create unique index "uq_wager_tx_single_reversal" on "wager_transactions" ("reference_transaction_id") where "status" = 'PROCESSED' and "kind" in ('REFUND', 'ROLLBACK');`
		);

		this.addSql(
			`create index "idx_wager_tx_pending_ref" on "wager_transactions" ("created_at") where "status" = 'PENDING_REFERENCE';`
		);
	}

	override down(): void | Promise<void> {
		this.addSql(`drop index if exists "idx_wager_tx_pending_ref";`);
		this.addSql(`drop index if exists "uq_wager_tx_single_reversal";`);
		this.addSql(`drop trigger if exists trg_prevent_wallet_ledger_mutation on wallet_ledger_entries;`);
		this.addSql(`drop function if exists prevent_ledger_mutation;`);
		this.addSql(`alter table "wager_transactions" drop constraint if exists "wager_transactions_wallet_id_foreign";`);
		this.addSql(`alter table "wallet_ledger_entries" drop constraint if exists "wallet_ledger_entries_wallet_id_foreign";`);
		this.addSql(`alter table "wallet_ledger_entries" drop constraint if exists "wallet_ledger_entries_arithmetic_check";`);
		this.addSql(`alter table "wallet_ledger_entries" drop constraint if exists "wallet_ledger_entries_balance_after_check";`);
		this.addSql(`alter table "wallet_ledger_entries" drop constraint if exists "wallet_ledger_entries_amount_check";`);
		this.addSql(
			`alter table "wallet_ledger_entries" drop constraint if exists "wallet_ledger_entries_wallet_id_transaction_id_unique";`
		);
	}
}
