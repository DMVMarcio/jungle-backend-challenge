import { Wallet } from '@/modules/wallet/domain/wallet';
import { LedgerDirection, WalletLedgerEntry } from '@/modules/wallet/domain/wallet-ledger-entry';
import { IntegrationEvent, IntegrationEventProps } from '@/shared/domain/events/integration-event';
import { MoneyProps } from '@/shared/domain/money/money';

export interface EventContext {
	eventId?: string;
	correlationId: string;
	causationId?: string;
}

export interface WalletBalanceChangedData {
	walletId: string;
	transactionId: string;
	direction: LedgerDirection;
	money: MoneyProps;
	balanceBefore: MoneyProps;
	balanceAfter: MoneyProps;
	walletVersion: number;
}

export class WalletBalanceChanged extends IntegrationEvent<WalletBalanceChangedData> {
	readonly eventType = 'WalletBalanceChanged';
	readonly version = 1;

	constructor(props: IntegrationEventProps<WalletBalanceChangedData>) {
		super(props);
	}

	static from(wallet: Wallet, entry: WalletLedgerEntry, ctx: EventContext): WalletBalanceChanged {
		return new WalletBalanceChanged({
			eventId: ctx.eventId ?? crypto.randomUUID(),
			aggregateId: wallet.id,
			correlationId: ctx.correlationId,
			causationId: ctx.causationId,
			occurredAt: entry.createdAt,
			data: {
				walletId: wallet.id,
				transactionId: entry.transactionId,
				direction: entry.direction,
				money: entry.money.toJSON(),
				balanceBefore: entry.balanceBefore.toJSON(),
				balanceAfter: entry.balanceAfter.toJSON(),
				walletVersion: wallet.version
			}
		});
	}
}
