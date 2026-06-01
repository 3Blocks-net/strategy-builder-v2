import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateVaultDto {
  @ApiProperty({ description: 'On-chain vault proxy address', example: '0x...' })
  address: string;

  @ApiProperty({ description: 'Chain ID where vault was deployed', example: 56 })
  chainId: number;

  @ApiProperty({ description: 'ERC-20 deposit token address', example: '0x55d398326f99059fF775485246999027B3197955' })
  depositToken: string;

  @ApiProperty({ description: 'Vault creation transaction hash' })
  txHash: string;

  @ApiProperty({ description: 'Block number of vault creation TX' })
  createdAtBlock: number;

  @ApiPropertyOptional({ description: 'Vault label (auto-assigned "Vault #N" if omitted)' })
  label?: string;
}
