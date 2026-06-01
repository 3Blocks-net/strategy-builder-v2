import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Contract, JsonRpcProvider } from 'ethers';
import { PrismaService } from '../database/prisma.service';

const VAULT_ABI = [
  'function automationCount() external view returns (uint32)',
  'function getAutomation(uint32 id) external view returns (tuple(bool active, bool ownerOnly, tuple(uint8 stepType, address target, bytes4 selector, uint32 nextOnTrue, uint32 nextOnFalse, bytes data)[] steps))',
];

@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async createDraft(vaultId: string, label?: string, description?: string) {
    const vault = await this.prisma.vault.findUniqueOrThrow({
      where: { id: vaultId },
    });

    return this.prisma.automation.create({
      data: {
        vaultId: vault.id,
        label,
        description,
        isDraft: true,
      },
    });
  }

  async findById(id: string) {
    const automation = await this.prisma.automation.findUnique({
      where: { id },
      include: { vault: true },
    });
    if (!automation) throw new NotFoundException('AUTOMATION_NOT_FOUND');

    if (automation.isDraft && automation.onChainId === null) {
      const reconciled = await this.tryReconcile(automation);
      if (reconciled) return reconciled;
    }

    return automation;
  }

  async findByVault(vaultId: string) {
    return this.prisma.automation.findMany({
      where: { vaultId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(
    id: string,
    data: {
      editorState?: any;
      label?: string;
      description?: string;
      ownerOnly?: boolean;
      stepCount?: number;
    },
  ) {
    return this.prisma.automation.update({
      where: { id },
      data,
    });
  }

  async confirmDeployment(
    id: string,
    onChainId: number,
    ownerOnly: boolean,
    stepCount: number,
  ) {
    return this.prisma.automation.update({
      where: { id },
      data: {
        onChainId,
        isDraft: false,
        ownerOnly,
        stepCount,
      },
    });
  }

  async delete(id: string) {
    await this.prisma.automation.delete({ where: { id } });
    return { deleted: true };
  }

  private async tryReconcile(automation: any): Promise<any | null> {
    try {
      const vault = automation.vault;
      if (!vault?.address) return null;

      const editorState = automation.editorState as any;
      if (!editorState?.nodes || editorState.nodes.length === 0) return null;

      const rpcUrl = this.configService.get<string>('RPC_URL');
      if (!rpcUrl) return null;

      const provider = new JsonRpcProvider(rpcUrl);
      try {
        const contract = new Contract(vault.address, VAULT_ABI, provider);
        const count = Number(await contract.automationCount());

        const linkedIds = await this.prisma.automation.findMany({
          where: { vaultId: vault.id, onChainId: { not: null } },
          select: { onChainId: true },
        });
        const linkedSet = new Set(linkedIds.map((a) => a.onChainId));

        const expectedStepCount = editorState.nodes.length;
        const step0 = editorState.nodes.find((n: any) => {
          const incoming = editorState.edges?.filter((e: any) => e.target === n.id) ?? [];
          return incoming.length === 0;
        });

        for (let i = 0; i < count; i++) {
          if (linkedSet.has(i)) continue;

          const onChain = await contract.getAutomation(i);
          const steps = onChain.steps;
          if (!steps || steps.length !== expectedStepCount) continue;

          if (step0 && steps.length > 0) {
            const onChainTarget = steps[0].target.toLowerCase();
            const expectedTarget = step0.data?.contractAddress?.toLowerCase();
            if (expectedTarget && onChainTarget !== expectedTarget) continue;
          }

          const reconciled = await this.prisma.automation.update({
            where: { id: automation.id },
            data: {
              onChainId: i,
              isDraft: false,
              stepCount: steps.length,
            },
            include: { vault: true },
          });

          this.logger.log(
            `Reconciled draft ${automation.id} → on-chain ID ${i} for vault ${vault.address}`,
          );
          return reconciled;
        }
      } finally {
        await provider.destroy();
      }
    } catch (err) {
      this.logger.warn(`Draft reconciliation failed for ${automation.id}: ${err}`);
    }

    return null;
  }
}
