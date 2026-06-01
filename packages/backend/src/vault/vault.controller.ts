import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { VaultService } from './vault.service';
import { VaultOwnerGuard } from './vault-owner.guard';
import { CreateVaultDto } from './dto/create-vault.dto';
import { UpdateVaultDto } from './dto/update-vault.dto';
import { CreateVaultEventDto } from './dto/create-vault-event.dto';

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

  @Post(':address/events')
  @UseGuards(VaultOwnerGuard)
  @ApiOperation({ summary: 'Record a deposit/withdrawal event' })
  @ApiParam({ name: 'address', description: 'Vault address' })
  async createEvent(
    @Param('address') address: string,
    @Body() dto: CreateVaultEventDto,
  ) {
    return this.vaultService.createEvent(address, dto);
  }

  @Get(':address/events')
  @UseGuards(VaultOwnerGuard)
  @ApiOperation({ summary: 'Get all events for a vault' })
  @ApiParam({ name: 'address', description: 'Vault address' })
  async getEvents(@Param('address') address: string) {
    return this.vaultService.getEvents(address);
  }

  @Get(':address/history')
  @UseGuards(VaultOwnerGuard)
  @ApiOperation({ summary: 'Get paginated transaction history' })
  @ApiParam({ name: 'address', description: 'Vault address' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 20, max: 100)' })
  async getHistory(
    @Param('address') address: string,
    @Query('page') pageStr?: string,
    @Query('limit') limitStr?: string,
  ) {
    const page = Math.max(1, parseInt(pageStr ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(limitStr ?? '20', 10) || 20));
    return this.vaultService.getHistory(address, page, limit);
  }
}
