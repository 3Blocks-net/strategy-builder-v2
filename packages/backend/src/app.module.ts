import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { VaultModule } from './vault/vault.module';
import { BlockchainModule } from './blockchain/blockchain.module';
import { PortfolioModule } from './portfolio/portfolio.module';
import { StepRegistryModule } from './step-registry/step-registry.module';
import { AutomationModule } from './automation/automation.module';
import { TokensModule } from './tokens/tokens.module';
import { IndexerModule } from './indexer/indexer.module';
import { CockpitModule } from './cockpit/cockpit.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    HealthModule,
    AuthModule,
    VaultModule,
    BlockchainModule,
    PortfolioModule,
    StepRegistryModule,
    AutomationModule,
    TokensModule,
    IndexerModule,
    CockpitModule,
  ],
})
export class AppModule {}
