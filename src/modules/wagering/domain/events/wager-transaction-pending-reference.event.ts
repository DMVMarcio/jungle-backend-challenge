import { WagerTransactionKind } from '@/modules/wagering/domain/wager-transaction';

import { IntegrationEvent, IntegrationEventProps } from '@/shared/domain/events/integration-event';
import { MoneyProps } from '@/shared/domain/money/money';

export interface WagerTransactionPendingReferenceData {
	transactionId: string;
	providerId: string;
	externalTransactionId: string;
	playerId: string;
	walletId: string;
	roundId: string;
	gameId: string;
	kind: WagerTransactionKind;
	money: MoneyProps;
	referenceExternalTransactionId: string;
}

export class WagerTransactionPendingReference extends IntegrationEvent<WagerTransactionPendingReferenceData> {
	readonly eventType = 'WagerTransactionPendingReference';
	readonly version = 1;

	constructor(props: IntegrationEventProps<WagerTransactionPendingReferenceData>) {
		super(props);
	}
}
