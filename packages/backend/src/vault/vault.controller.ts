import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { VaultService } from './vault.service';
import { VaultOwnerGuard } from './vault-owner.guard';
import { CreateVaultDto } from './dto/create-vault.dto';
import { UpdateVaultDto } from './dto/update-vault.dto';

@Controller('vaults')
export class VaultController {
  constructor(private readonly vaultService: VaultService) {}

  @Post()
  async create(@Request() req: any, @Body() dto: CreateVaultDto) {
    return this.vaultService.createVault(req.user.address, dto);
  }

  @Get()
  async list(@Request() req: any) {
    return this.vaultService.listVaults(req.user.address);
  }

  @Patch(':address')
  @UseGuards(VaultOwnerGuard)
  async updateLabel(
    @Param('address') address: string,
    @Request() req: any,
    @Body() dto: UpdateVaultDto,
  ) {
    return this.vaultService.updateLabel(address, req.user.address, dto.label);
  }
}
