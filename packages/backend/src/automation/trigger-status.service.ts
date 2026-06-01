import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Contract, JsonRpcProvider, AbiCoder } from 'ethers';
import { PrismaService } from '../database/prisma.service';

const VAULT_ABI = [
  'function automationCount() external view returns (uint32)',
  'function getAutomation(uint32 id) external view returns (tuple(bool active, bool ownerOnly, tuple(uint8 stepType, address target, bytes4 selector, uint32 nextOnTrue, uint32 nextOnFalse, bytes data)[] steps))',
  'function getContext() external view returns (bytes[])',
  'function isTriggerMet(uint32 automationId) external view returns (bool)',
];

interface TriggerStatus {
  type: 'interval' | 'timer' | 'balance' | 'owner-only' | 'unknown';
  met: boolean;
  description: string;
  nextFireAt?: string;
}

export interface AutomationStatus {
  onChainId: number;
  active: boolean;
  triggerStatus: TriggerStatus;
}

interface CacheEntry {
  statuses: AutomationStatus[];
  expiresAt: number;
}

const CACHE_TTL = 30_000;
const abiCoder = AbiCoder.defaultAbiCoder();

@Injectable()
export class TriggerStatusService {
  private readonly logger = new Logger(TriggerStatusService.name);
  private cache = new Map<string, CacheEntry>();

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async getStatuses(vaultAddress: string): Promise<AutomationStatus[]> {
    const cached = this.cache.get(vaultAddress);
    if (cached && Date.now() < cached.expiresAt) return cached.statuses;

    const rpcUrl = this.configService.get<string>('RPC_URL')!;
    const provider = new JsonRpcProvider(rpcUrl);

    try {
      const vault = new Contract(vaultAddress, VAULT_ABI, provider);

      const count = Number(await vault.automationCount());
      if (count === 0) return [];

      const stepTypes = await this.prisma.stepType.findMany();
      const addressToType = new Map(
        stepTypes.map((st) => [st.contractAddress.toLowerCase(), st]),
      );

      let ctx: string[] = [];
      try {
        ctx = await vault.getContext();
      } catch {
        // no context yet
      }

      const statuses: AutomationStatus[] = [];

      for (let i = 0; i < count; i++) {
        try {
          const auto = await vault.getAutomation(i);
          const active: boolean = auto.active;
          const steps = auto.steps;

          if (!steps || steps.length === 0) {
            statuses.push({
              onChainId: i,
              active,
              triggerStatus: { type: 'unknown', met: false, description: 'No steps' },
            });
            continue;
          }

          const step0 = steps[0];
          const step0Type = Number(step0.stepType);

          if (step0Type === 1) {
            statuses.push({
              onChainId: i,
              active,
              triggerStatus: { type: 'owner-only', met: false, description: 'Owner-only (no trigger)' },
            });
            continue;
          }

          const target = step0.target.toLowerCase();
          const matched = addressToType.get(target);

          if (!matched) {
            let met = false;
            try { met = await vault.isTriggerMet(i); } catch {}
            statuses.push({
              onChainId: i,
              active,
              triggerStatus: { type: 'unknown', met, description: met ? 'Condition met' : 'Condition not met' },
            });
            continue;
          }

          const triggerStatus = this.interpretTrigger(matched.name, step0.data, ctx, vault, i);
          statuses.push({ onChainId: i, active, triggerStatus: await triggerStatus });
        } catch (err) {
          this.logger.warn(`Failed to read automation ${i} for ${vaultAddress}: ${err}`);
          statuses.push({
            onChainId: i,
            active: false,
            triggerStatus: { type: 'unknown', met: false, description: 'Error reading status' },
          });
        }
      }

      this.cache.set(vaultAddress, { statuses, expiresAt: Date.now() + CACHE_TTL });
      return statuses;
    } finally {
      await provider.destroy();
    }
  }

  private async interpretTrigger(
    stepTypeName: string,
    data: string,
    ctx: string[],
    vault: Contract,
    automationId: number,
  ): Promise<TriggerStatus> {
    if (stepTypeName === 'Interval Condition') {
      return this.interpretInterval(data, ctx);
    }
    if (stepTypeName === 'Timer Condition') {
      return this.interpretTimer(data, ctx);
    }
    if (stepTypeName === 'Token Balance Condition') {
      return this.interpretBalance(vault, automationId);
    }
    let met = false;
    try { met = await vault.isTriggerMet(automationId); } catch {}
    return { type: 'unknown', met, description: met ? 'Condition met' : 'Condition not met' };
  }

  private interpretInterval(data: string, ctx: string[]): TriggerStatus {
    try {
      const [, timeSlot] = abiCoder.decode(['uint256', 'uint32'], data);
      const slotIdx = Number(timeSlot);
      if (slotIdx >= ctx.length || !ctx[slotIdx] || ctx[slotIdx] === '0x') {
        return { type: 'interval', met: false, description: 'Not initialized' };
      }
      const nextTime = Number(abiCoder.decode(['uint256'], ctx[slotIdx])[0]);
      const now = Math.floor(Date.now() / 1000);
      if (now >= nextTime) {
        return { type: 'interval', met: true, description: 'Ready to fire' };
      }
      const diff = nextTime - now;
      return {
        type: 'interval',
        met: false,
        description: `Fires in ${this.formatDuration(diff)}`,
        nextFireAt: new Date(nextTime * 1000).toISOString(),
      };
    } catch {
      return { type: 'interval', met: false, description: 'Unable to decode' };
    }
  }

  private interpretTimer(data: string, ctx: string[]): TriggerStatus {
    try {
      const [delta, timeSlot] = abiCoder.decode(['uint256', 'uint32'], data);
      const slotIdx = Number(timeSlot);
      if (slotIdx >= ctx.length || !ctx[slotIdx] || ctx[slotIdx] === '0x') {
        return { type: 'timer', met: false, description: 'Stopped' };
      }
      const startTime = Number(abiCoder.decode(['uint256'], ctx[slotIdx])[0]);
      if (startTime === 0) {
        return { type: 'timer', met: false, description: 'Stopped' };
      }
      const fireTime = startTime + Number(delta);
      const now = Math.floor(Date.now() / 1000);
      if (now >= fireTime) {
        return { type: 'timer', met: true, description: 'Ready to fire' };
      }
      const diff = fireTime - now;
      return {
        type: 'timer',
        met: false,
        description: `Fires in ${this.formatDuration(diff)}`,
        nextFireAt: new Date(fireTime * 1000).toISOString(),
      };
    } catch {
      return { type: 'timer', met: false, description: 'Stopped' };
    }
  }

  private async interpretBalance(vault: Contract, automationId: number): Promise<TriggerStatus> {
    try {
      const met: boolean = await vault.isTriggerMet(automationId);
      return {
        type: 'balance',
        met,
        description: met ? 'Condition met' : 'Condition not met',
      };
    } catch {
      return { type: 'balance', met: false, description: 'Unable to check' };
    }
  }

  private formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
}
