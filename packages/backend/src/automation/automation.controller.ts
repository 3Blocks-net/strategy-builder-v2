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
import { VaultOwnerGuard } from '../vault/vault-owner.guard';
import { AutomationService } from './automation.service';
import { EncodingService } from './encoding.service';

@Controller('vaults')
export class AutomationController {
  constructor(
    private readonly automationService: AutomationService,
    private readonly encodingService: EncodingService,
  ) {}

  @Post(':address/automations')
  @UseGuards(VaultOwnerGuard)
  async createDraft(
    @Request() req: any,
    @Body() body: { label?: string; description?: string },
  ) {
    const vault = req.vault;
    return this.automationService.createDraft(vault.id, body.label, body.description);
  }

  @Get(':address/automations')
  @UseGuards(VaultOwnerGuard)
  async list(@Request() req: any) {
    return this.automationService.findByVault(req.vault.id);
  }

  @Get(':address/automations/:id')
  @UseGuards(VaultOwnerGuard)
  async get(@Param('id') id: string) {
    return this.automationService.findById(id);
  }

  @Patch(':address/automations/:id')
  @UseGuards(VaultOwnerGuard)
  async update(
    @Param('id') id: string,
    @Body()
    body: {
      editorState?: any;
      label?: string;
      description?: string;
      onChainId?: number;
      txHash?: string;
      ownerOnly?: boolean;
      stepCount?: number;
    },
  ) {
    if (body.onChainId !== undefined) {
      return this.automationService.confirmDeployment(
        id,
        body.onChainId,
        body.ownerOnly ?? false,
        body.stepCount ?? 0,
      );
    }
    return this.automationService.update(id, {
      editorState: body.editorState,
      label: body.label,
      description: body.description,
    });
  }

  @Post(':address/automations/:id/encode')
  @UseGuards(VaultOwnerGuard)
  async encode(
    @Param('address') address: string,
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: { contextOverrides?: Record<number, string> },
  ) {
    const automation = await this.automationService.findById(id);
    const editorState = automation.editorState as any;

    if (!editorState?.nodes || !editorState?.edges) {
      return this.encodingService.encode(
        req.vault.id,
        address,
        id,
        { nodes: [], edges: [] },
        body.contextOverrides,
      );
    }

    return this.encodingService.encode(
      req.vault.id,
      address,
      id,
      { nodes: editorState.nodes, edges: editorState.edges },
      body.contextOverrides,
    );
  }
}
