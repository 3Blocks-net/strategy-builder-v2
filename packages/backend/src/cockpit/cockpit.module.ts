import { Module } from '@nestjs/common';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { VaultModule } from '../vault/vault.module';
import { ValuationService } from './valuation.service';
import { CockpitController } from './cockpit.controller';
import { PROTOCOL_ADAPTERS, ProtocolAdapter } from './protocol-adapter';

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
    {
      // Registered protocol adapters. Empty until #02/#03 add Aave/PCS.
      provide: PROTOCOL_ADAPTERS,
      useFactory: (): ProtocolAdapter[] => [],
    },
  ],
  exports: [ValuationService],
})
export class CockpitModule {}
