import { Module } from '@nestjs/common';
import { VaultModule } from '../vault/vault.module';
import { ContextService } from './context.service';
import { ContextController } from './context.controller';
import { AutomationService } from './automation.service';
import { AutomationController } from './automation.controller';
import { EncodingService } from './encoding.service';
import { TriggerStatusService } from './trigger-status.service';

@Module({
  imports: [VaultModule],
  controllers: [ContextController, AutomationController],
  providers: [ContextService, AutomationService, EncodingService, TriggerStatusService],
  exports: [ContextService, AutomationService, EncodingService, TriggerStatusService],
})
export class AutomationModule {}
