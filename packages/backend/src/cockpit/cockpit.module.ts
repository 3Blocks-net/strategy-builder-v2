import { Module } from '@nestjs/common';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { VaultModule } from '../vault/vault.module';
import { ValuationService } from './valuation.service';
import { CockpitController } from './cockpit.controller';
import { PROTOCOL_ADAPTERS, ProtocolAdapter } from './protocol-adapter';
import { AaveV3Adapter } from './aave/aave-v3.adapter';
import { PancakeV3Adapter } from './pancakeswap/pancake-v3.adapter';

/**
 * Vault-Cockpit (PRD `vault-cockpit-prd.md`).
 *
 * Slice #01 — the spine: `ValuationService` (single source of truth) + the
 * `ProtocolAdapter` registry (empty for now) behind `GET /vaults/:address/
 * positions`. Aave/PCS adapters (#02/#03), snapshots (#04), chart (#05) and
 * performance (#06/#07) extend this module.
 */
@Module({
  imports: [PortfolioModule, BlockchainModule, VaultModule],
  controllers: [CockpitController],
  providers: [
    ValuationService,
    AaveV3Adapter,
    PancakeV3Adapter,
    {
      // Registered protocol adapters (Aave V3 + PancakeSwap V3).
      provide: PROTOCOL_ADAPTERS,
      useFactory: (
        aave: AaveV3Adapter,
        pcs: PancakeV3Adapter,
      ): ProtocolAdapter[] => [aave, pcs],
      inject: [AaveV3Adapter, PancakeV3Adapter],
    },
  ],
  exports: [ValuationService],
})
export class CockpitModule {}
