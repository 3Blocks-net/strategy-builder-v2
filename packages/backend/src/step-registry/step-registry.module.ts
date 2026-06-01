import { Module } from '@nestjs/common';
import { StepRegistryController } from './step-registry.controller';
import { StepRegistryService } from './step-registry.service';

@Module({
  controllers: [StepRegistryController],
  providers: [StepRegistryService],
  exports: [StepRegistryService],
})
export class StepRegistryModule {}
