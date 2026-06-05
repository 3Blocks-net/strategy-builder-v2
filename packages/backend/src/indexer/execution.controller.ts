import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { VaultOwnerGuard } from '../vault/vault-owner.guard';
import { ExecutionService } from './execution.service';

@ApiTags('Executions')
@ApiBearerAuth()
@Controller('vaults')
export class ExecutionController {
  constructor(private readonly executions: ExecutionService) {}

  @Get(':address/executions')
  @UseGuards(VaultOwnerGuard)
  @ApiOperation({ summary: 'Paginated execution history (vault-wide or per-automation)' })
  @ApiParam({ name: 'address', description: 'Vault address' })
  @ApiQuery({ name: 'automationId', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  async getExecutions(
    @Param('address') address: string,
    @Query('automationId') automationIdStr?: string,
    @Query('page') pageStr?: string,
    @Query('pageSize') pageSizeStr?: string,
  ) {
    const page = Math.max(1, parseInt(pageStr ?? '1', 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(pageSizeStr ?? '20', 10) || 20),
    );
    const automationId =
      automationIdStr !== undefined && automationIdStr !== ''
        ? Number(automationIdStr)
        : undefined;

    return this.executions.getExecutions(address, automationId, page, pageSize);
  }
}
