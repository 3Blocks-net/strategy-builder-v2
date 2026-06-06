import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JsonRpcProvider } from 'ethers';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { VaultModule } from '../vault/vault.module';
import { ValuationService } from './valuation.service';
import { CockpitController } from './cockpit.controller';
import { PROTOCOL_ADAPTERS, ProtocolAdapter } from './protocol-adapter';
import { AaveV3Adapter } from './aave/aave-v3.adapter';
import { PancakeV3Adapter } from './pancakeswap/pancake-v3.adapter';
import {
  SnapshotService,
  SNAPSHOT_PROVIDER,
  SnapshotProvider,
  resolveSnapshotRpcUrl,
} from './snapshot.service';
import { HistoryService } from './history.service';

/**
 * Vault-Cockpit (PRD `vault-cockpit-prd.md`).
 *
 * - #01 spine: ValuationService (single source of truth) + ProtocolAdapter registry
 * - #02/#03: Aave V3 + PancakeSwap V3 adapters
 * - #04: SnapshotService loop + VaultValueSnapshot read model behind /positions
 */
@Module({
  imports: [PortfolioModule, BlockchainModule, VaultModule],
  controllers: [CockpitController],
  providers: [
    ValuationService,
    SnapshotService,
    HistoryService,
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
    {
      // The snapshot loop's own provider: dedicated SNAPSHOT_RPC_URL when set,
      // else the shared RPC_URL, else null (→ loop dormant).
      provide: SNAPSHOT_PROVIDER,
      useFactory: (config: ConfigService): SnapshotProvider | null => {
        const url = resolveSnapshotRpcUrl(
          config.get<string>('SNAPSHOT_RPC_URL'),
          config.get<string>('RPC_URL'),
        );
        return url
          ? new JsonRpcProvider(url, undefined, { staticNetwork: true })
          : null;
      },
      inject: [ConfigService],
    },
  ],
  exports: [ValuationService, SnapshotService],
})
export class CockpitModule {}
