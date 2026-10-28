import { FailureCode, WagerTransactionKind } from '@/modules/wagering/domain/wager-transaction';
import { IntegrationEvent, IntegrationEventProps } from '@/shared/domain/events/integration-event';
import { MoneyProps } from '@/shared/domain/money/money';

export interface WagerTransactionRejectedData {
	transactionId: string;
	providerId: string;
	externalTransactionId: string;
	playerId: string;
	walletId: string;
	roundId: string;
	gameId: string;
	kind: WagerTransactionKind;
	money: MoneyProps;
	failureCode: FailureCode;
	referenceExternalTransactionId?: string;
}

export class WagerTransactionRejected extends IntegrationEvent<WagerTransactionRejectedData> {
	readonly eventType = 'WagerTransactionRejected';
	readonly version = 1;

	constructor(props: IntegrationEventProps<WagerTransactionRejectedData>) {
		super(props);
	}
}
