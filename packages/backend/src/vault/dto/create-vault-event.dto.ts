export class CreateVaultEventDto {
  eventType: string;
  token: string;
  amount: string;
  feeAmount: string;
  feeBps: number;
  txHash: string;
  blockNumber: number;
  blockTimestamp: string;
}
