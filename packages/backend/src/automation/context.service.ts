import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Contract, JsonRpcProvider } from 'ethers';
import { PrismaService } from '../database/prisma.service';

const VAULT_ABI = ['function getContext() external view returns (bytes[])'];

interface SlotMeta {
  name: string;
  createdByAutomationId: string;
}

export type ContextSlotsJson = Record<string, SlotMeta>;

@Injectable()
export class ContextService {
  private readonly logger = new Logger(ContextService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async allocateSlots(
    vaultId: string,
    slotNames: string[],
    automationId: string,
  ): Promise<Record<string, number>> {
    const vault = await this.prisma.vault.findUniqueOrThrow({
      where: { id: vaultId },
    });

    const slots: ContextSlotsJson = (vault.contextSlots as unknown as ContextSlotsJson) ?? {};
    const mapping: Record<string, number> = {};

    const existingByName = new Map<string, number>();
    for (const [idx, meta] of Object.entries(slots)) {
      existingByName.set(meta.name, parseInt(idx, 10));
    }

    let nextIndex = Object.keys(slots).length > 0
      ? Math.max(...Object.keys(slots).map(Number)) + 1
      : 0;

    for (const name of slotNames) {
      const existing = existingByName.get(name);
      if (existing !== undefined) {
        mapping[name] = existing;
      } else {
        const idx = nextIndex++;
        slots[String(idx)] = { name, createdByAutomationId: automationId };
        existingByName.set(name, idx);
        mapping[name] = idx;
      }
    }

    await this.prisma.vault.update({
      where: { id: vaultId },
      data: { contextSlots: slots as any },
    });

    return mapping;
  }

  buildExpandedContext(
    currentCtx: string[],
    newSlots: { index: number; initialValue: string }[],
    overrides?: Record<number, string>,
  ): string[] {
    const maxIndex = Math.max(
      currentCtx.length - 1,
      ...newSlots.map((s) => s.index),
      ...Object.keys(overrides ?? {}).map(Number),
    );

    if (maxIndex < 0) return [];

    const expanded: string[] = [];
    for (let i = 0; i <= maxIndex; i++) {
      if (overrides && i in overrides) {
        expanded.push(overrides[i]);
      } else if (i < currentCtx.length) {
        expanded.push(currentCtx[i]);
      } else {
        const newSlot = newSlots.find((s) => s.index === i);
        expanded.push(newSlot?.initialValue ?? '0x');
      }
    }

    return expanded;
  }

  async getContextSlots(vaultAddress: string) {
    const vault = await this.prisma.vault.findUniqueOrThrow({
      where: { address: vaultAddress },
    });

    const dbSlots: ContextSlotsJson = (vault.contextSlots as unknown as ContextSlotsJson) ?? {};
    const dbSlotCount = Object.keys(dbSlots).length;

    let onChainContext: string[] = [];
    try {
      onChainContext = await this.readOnChainContext(vaultAddress);
    } catch (err) {
      this.logger.warn(`Failed to read on-chain context for ${vaultAddress}: ${err}`);
    }

    const contextLength = onChainContext.length;
    const syncWarning = dbSlotCount !== contextLength;

    const slots: Record<
      string,
      SlotMeta & { currentOnChainValue: string }
    > = {};
    for (const [idx, meta] of Object.entries(dbSlots)) {
      const i = parseInt(idx, 10);
      slots[idx] = {
        ...meta,
        currentOnChainValue: i < onChainContext.length ? onChainContext[i] : '0x',
      };
    }

    return { slots, contextLength, dbSlotCount, syncWarning };
  }

  async readOnChainContext(vaultAddress: string): Promise<string[]> {
    const rpcUrl = this.configService.get<string>('RPC_URL')!;
    const provider = new JsonRpcProvider(rpcUrl);
    try {
      const vault = new Contract(vaultAddress, VAULT_ABI, provider);
      const ctx: string[] = await vault.getContext();
      return ctx;
    } finally {
      await provider.destroy();
    }
  }
}
