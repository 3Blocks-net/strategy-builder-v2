import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { VaultService } from './vault.service';
import { VaultOwnerGuard } from './vault-owner.guard';
import { CreateVaultDto } from './dto/create-vault.dto';
import { UpdateVaultDto } from './dto/update-vault.dto';

@ApiTags('Vaults')
@ApiBearerAuth()
@Controller('vaults')
export class VaultController {
  constructor(private readonly vaultService: VaultService) {}

  @Post()
  @ApiOperation({ summary: 'Register a vault after on-chain creation' })
  async create(@Request() req: any, @Body() dto: CreateVaultDto) {
    return this.vaultService.createVault(req.user.address, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all vaults for the authenticated user' })
  async list(@Request() req: any) {
    return this.vaultService.listVaults(req.user.address);
  }

  @Patch(':address')
  @UseGuards(VaultOwnerGuard)
  @ApiOperation({ summary: 'Update vault label' })
  @ApiParam({ name: 'address', description: 'Vault address' })
  async updateLabel(
    @Param('address') address: string,
    @Request() req: any,
    @Body() dto: UpdateVaultDto,
  ) {
    return this.vaultService.updateLabel(address, req.user.address, dto.label);
  }

  // Deposit/withdraw history is now indexer-owned and served by the unified
  // GET /vaults/:address/executions endpoint (PEC-219 #04). The legacy
  // frontend-written POST /events + GET /events + GET /history are removed.
}
