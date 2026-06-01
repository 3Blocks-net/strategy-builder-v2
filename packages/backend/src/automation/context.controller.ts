import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { VaultOwnerGuard } from '../vault/vault-owner.guard';
import { ContextService } from './context.service';

@Controller('vaults')
export class ContextController {
  constructor(private readonly contextService: ContextService) {}

  @Get(':address/context-slots')
  @UseGuards(VaultOwnerGuard)
  getContextSlots(@Param('address') address: string) {
    return this.contextService.getContextSlots(address);
  }
}
