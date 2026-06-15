import {
  Controller,
  Get,
  Param,
  NotFoundException,
} from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { StepRegistryService } from './step-registry.service';

@Controller('step-types')
@Public()
export class StepRegistryController {
  constructor(private readonly stepRegistryService: StepRegistryService) {}

  @Get()
  findAll() {
    return this.stepRegistryService.findAll();
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    const stepType = await this.stepRegistryService.findById(id);
    if (!stepType) {
      throw new NotFoundException(`StepType with id ${id} not found`);
    }
    return stepType;
  }
}
