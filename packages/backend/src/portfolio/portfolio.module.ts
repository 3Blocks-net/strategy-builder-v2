import { Module } from '@nestjs/common';
import { AlchemyService } from './alchemy.service';
import { PriceService } from './price.service';
import { VaultPortfolioService } from './vault-portfolio.service';
import { PortfolioController } from './portfolio.controller';
import { VaultModule } from '../vault/vault.module';

@Module({
  imports: [VaultModule],
  controllers: [PortfolioController],
  providers: [AlchemyService, PriceService, VaultPortfolioService],
  exports: [VaultPortfolioService, PriceService],
})
export class PortfolioModule {}
