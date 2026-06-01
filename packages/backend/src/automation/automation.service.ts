import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class AutomationService {
  constructor(private readonly prisma: PrismaService) {}

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
    });
    if (!automation) throw new NotFoundException('AUTOMATION_NOT_FOUND');
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
}
