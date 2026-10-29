import { Migration } from '@mikro-orm/migrations';

export class Migration20261028220000 extends Migration {
	override name = 'Migration20261028220000';

	override up(): void | Promise<void> {
		this.addSql(`alter table "wager_transactions" add column "balance_after" numeric(18, 2) null;`);
		this.addSql(`alter table "wager_transactions" add column "attempts" int not null default 0;`);
		this.addSql(`alter table "wager_transactions" add column "next_attempt_at" timestamptz null;`);
		this.addSql(
			`alter table "wager_transactions" add constraint "wager_transactions_amount_check" check ("amount" > 0);`
		);
		this.addSql(
			`create index "idx_wager_tx_pending_ref_attempts" on "wager_transactions" ("next_attempt_at", "attempts") where "status" = 'PENDING_REFERENCE';`
		);
	}

	override down(): void | Promise<void> {
		this.addSql(`drop index if exists "idx_wager_tx_pending_ref_attempts";`);
		this.addSql(`alter table "wager_transactions" drop constraint if exists "wager_transactions_amount_check";`);
		this.addSql(`alter table "wager_transactions" drop column if exists "next_attempt_at";`);
		this.addSql(`alter table "wager_transactions" drop column if exists "attempts";`);
		this.addSql(`alter table "wager_transactions" drop column if exists "balance_after";`);
	}
}
