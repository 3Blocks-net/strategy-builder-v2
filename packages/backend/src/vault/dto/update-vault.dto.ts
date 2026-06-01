import { ApiProperty } from '@nestjs/swagger';

export class UpdateVaultDto {
  @ApiProperty({ description: 'New vault label (must be unique per user)' })
  label: string;
}
