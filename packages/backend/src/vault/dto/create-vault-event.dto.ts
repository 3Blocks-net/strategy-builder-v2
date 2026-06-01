import { ApiProperty } from '@nestjs/swagger';

export class CreateVaultEventDto {
  @ApiProperty({ description: 'Event type', enum: ['DEPOSIT', 'WITHDRAWAL'] })
  eventType: string;

  @ApiProperty({ description: 'Token address' })
  token: string;

  @ApiProperty({ description: 'Amount (raw BigInt string)' })
  amount: string;

  @ApiProperty({ description: 'Fee amount (raw BigInt string)' })
  feeAmount: string;

  @ApiProperty({ description: 'Fee rate in basis points' })
  feeBps: number;

  @ApiProperty({ description: 'Transaction hash' })
  txHash: string;

  @ApiProperty({ description: 'Block number' })
  blockNumber: number;

  @ApiProperty({ description: 'Block timestamp (ISO 8601)' })
  blockTimestamp: string;
}
