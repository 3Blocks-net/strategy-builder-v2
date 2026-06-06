import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JsonRpcProvider } from 'ethers';
import { VaultModule } from '../vault/vault.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { AuthModule } from '../auth/auth.module';
import { IndexerService } from './indexer.service';
import { IndexerCursorStore } from './indexer-cursor.store';
import { ExecutionService } from './execution.service';
import { ExecutionController } from './execution.controller';
import { IndexerStatusController } from './indexer-status.controller';
import { FailureIngestController } from './failure-ingest.controller';
import { FailureIngestService } from './failure-ingest.service';
import { KeeperIngestGuard } from './keeper-ingest.guard';
import { ExecutionsGateway } from './executions.gateway';
import { INDEXER_PROVIDER } from './indexer-provider';
import { EXECUTION_EVENTS_PORT } from './execution-events.port';
import { PROTOCOL_FLOW_SOURCES, ProtocolFlowSource } from './protocol-flow';
import { CockpitModule } from '../cockpit/cockpit.module';
import {
  PROTOCOL_ADAPTERS,
  ProtocolAdapter,
} from '../cockpit/protocol-adapter';

/**
 * Execution indexer (PEC-219, Path B). Owns the poll loop, the durable cursor,
 * the read-side history service, the freshness endpoint, and the real-time
 * gateway. `EXECUTION_EVENTS_PORT` is bound to the gateway so the indexer pushes
 * new SUCCESS rows in-process without importing the gateway directly.
 *
 * Slice #08: also ingests adapter-declared protocol flows (Aave Supply/Withdraw)
 * into ProtocolFlow. The flow sources are the Cockpit protocol adapters that
 * expose `logSubscriptions()`; the indexer core stays protocol-agnostic.
 */
@Module({
  imports: [
    VaultModule,
    PortfolioModule,
    BlockchainModule,
    AuthModule,
    CockpitModule,
  ],
  controllers: [ExecutionController, IndexerStatusController, FailureIngestController],
  providers: [
    IndexerService,
    IndexerCursorStore,
    ExecutionService,
    FailureIngestService,
    KeeperIngestGuard,
    ExecutionsGateway,
    { provide: EXECUTION_EVENTS_PORT, useExisting: ExecutionsGateway },
    {
      // Flow sources = the Cockpit adapters that declare log subscriptions.
      provide: PROTOCOL_FLOW_SOURCES,
      inject: [PROTOCOL_ADAPTERS],
      useFactory: (adapters: ProtocolAdapter[]): ProtocolFlowSource[] =>
        adapters.filter(
          (a): a is ProtocolAdapter & ProtocolFlowSource =>
            typeof (a as Partial<ProtocolFlowSource>).logSubscriptions ===
            'function',
        ),
    },
    {
      // HTTP JsonRpcProvider with staticNetwork (no WebSocketProvider — research §15.5.5);
      // null when RPC_URL is unset → indexer stays dormant.
      provide: INDEXER_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('RPC_URL');
        return url
          ? new JsonRpcProvider(url, undefined, { staticNetwork: true })
          : null;
      },
    },
  ],
  exports: [IndexerService, IndexerCursorStore, ExecutionService],
})
export class IndexerModule {}
