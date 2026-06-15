import { ApiProperty } from '@nestjs/swagger';

export class VerifyDto {
  @ApiProperty({ description: 'SIWE message string' })
  message: string;

  @ApiProperty({ description: 'Wallet signature of the SIWE message' })
  signature: string;
}
