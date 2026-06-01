import {
  Body,
  ConflictException,
  Controller,
  Delete,
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
import { TriggerStatusService } from './trigger-status.service';

@Controller('vaults')
export class AutomationController {
  constructor(
    private readonly automationService: AutomationService,
    private readonly encodingService: EncodingService,
    private readonly triggerStatusService: TriggerStatusService,
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

  @Get(':address/automations/trigger-statuses')
  @UseGuards(VaultOwnerGuard)
  async triggerStatuses(@Param('address') address: string) {
    const statuses = await this.triggerStatusService.getStatuses(address);
    return { statuses };
  }

  @Get(':address/automations')
  @UseGuards(VaultOwnerGuard)
  async list(@Param('address') address: string, @Request() req: any) {
    const automations = await this.automationService.findByVault(req.vault.id);
    let statusMap = new Map<number, any>();
    try {
      const statuses = await this.triggerStatusService.getStatuses(address);
      statusMap = new Map(statuses.map((s) => [s.onChainId, s]));
    } catch {}

    return automations.map((a) => {
      const status = a.onChainId !== null ? statusMap.get(a.onChainId) : undefined;
      return {
        ...a,
        editorState: undefined,
        active: status?.active ?? null,
        triggerStatus: status?.triggerStatus ?? null,
      };
    });
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

  @Post(':address/automations/:id/encode-update')
  @UseGuards(VaultOwnerGuard)
  async encodeUpdate(
    @Param('address') address: string,
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: { contextOverrides?: Record<number, string> },
  ) {
    const automation = await this.automationService.findById(id);
    if (automation.onChainId === null) {
      throw new ConflictException('Cannot update a draft automation');
    }
    const editorState = automation.editorState as any;
    const graph = editorState?.nodes
      ? { nodes: editorState.nodes, edges: editorState.edges ?? [] }
      : { nodes: [], edges: [] };

    return this.encodingService.encodeUpdate(
      req.vault.id,
      address,
      id,
      automation.onChainId,
      graph,
      body.contextOverrides,
    );
  }

  @Post(':address/automations/:id/encode-toggle')
  @UseGuards(VaultOwnerGuard)
  async encodeToggle(
    @Param('id') id: string,
    @Body() body: { active: boolean },
  ) {
    const automation = await this.automationService.findById(id);
    if (automation.onChainId === null) {
      throw new ConflictException('Cannot toggle a draft automation');
    }
    const calldata = this.encodingService.encodeToggle(automation.onChainId, body.active);
    return { calldata, functionName: 'setAutomationActive' };
  }

  @Delete(':address/automations/:id')
  @UseGuards(VaultOwnerGuard)
  async delete(
    @Param('address') address: string,
    @Param('id') id: string,
  ) {
    const automation = await this.automationService.findById(id);

    if (automation.onChainId !== null) {
      const statuses = await this.triggerStatusService.getStatuses(address);
      const status = statuses.find((s) => s.onChainId === automation.onChainId);
      if (status?.active) {
        throw new ConflictException(
          'Automation must be deactivated on-chain before deletion',
        );
      }
    }

    return this.automationService.delete(id);
  }
}
