import {
  Controller,
  Get,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import { VaultPortfolioService } from './vault-portfolio.service';
import { VaultOwnerGuard } from '../vault/vault-owner.guard';
import { VaultService } from '../vault/vault.service';

@Controller('vaults')
export class PortfolioController {
  constructor(
    private readonly portfolioService: VaultPortfolioService,
    private readonly vaultService: VaultService,
  ) {}

  @Get('overview')
  async getOverview(@Request() req: any) {
    const vaults = await this.vaultService.listVaults(req.user.address);
    const overview = await this.portfolioService.getOverview(
      vaults.map((v) => ({
        address: v.address,
        label: v.label,
        depositToken: v.depositToken,
        chainId: v.chainId,
        createdAt: v.createdAt,
      })),
    );
    return { vaults: overview };
  }

  @Get(':address/portfolio')
  @UseGuards(VaultOwnerGuard)
  async getPortfolio(@Param('address') address: string) {
    return this.portfolioService.getPortfolio(address);
  }
}
