import { WagerTransactionKind } from '@/modules/wagering/domain/wager-transaction';

import { IntegrationEvent, IntegrationEventProps } from '@/shared/domain/events/integration-event';
import { MoneyProps } from '@/shared/domain/money/money';

export interface WagerTransactionProcessedData {
	transactionId: string;
	providerId: string;
	externalTransactionId: string;
	playerId: string;
	walletId: string;
	roundId: string;
	gameId: string;
	kind: WagerTransactionKind;
	money: MoneyProps;
	referenceExternalTransactionId?: string;
	referenceTransactionId?: string;
}

export class WagerTransactionProcessed extends IntegrationEvent<WagerTransactionProcessedData> {
	readonly eventType = 'WagerTransactionProcessed';
	readonly version = 1;

	constructor(props: IntegrationEventProps<WagerTransactionProcessedData>) {
		super(props);
	}
}
