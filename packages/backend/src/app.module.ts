import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { VaultModule } from './vault/vault.module';
import { BlockchainModule } from './blockchain/blockchain.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    HealthModule,
    AuthModule,
    VaultModule,
    BlockchainModule,
  ],
})
export class AppModule {}
