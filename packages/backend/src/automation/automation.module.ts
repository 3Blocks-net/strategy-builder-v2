import { Module } from '@nestjs/common';
import { VaultModule } from '../vault/vault.module';
import { ContextService } from './context.service';
import { ContextController } from './context.controller';

@Module({
  imports: [VaultModule],
  controllers: [ContextController],
  providers: [ContextService],
  exports: [ContextService],
})
export class AutomationModule {}
