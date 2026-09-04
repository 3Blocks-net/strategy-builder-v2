import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JsonRpcProvider } from 'ethers';

/**
 * Raised when a read is asked for a vault that has no code on the current
 * chain. Extends NotFoundException so the HTTP layer answers 404 with a
 * readable reason instead of a decoding error, while callers that value a
 * whole portfolio can recognise it and simply leave the row out.
 */
export class VaultNotOnChainError extends NotFoundException {
  constructor(readonly vaultAddress: string) {
    super(
      `Vault ${vaultAddress} does not exist on this chain instance (no code at that address).`,
    );
  }
}

/**
 * Answers whether a vault address still carries code on the chain this backend
 * is pointed at.
 *
 * The database outlives the chain: restarting a local fork wipes every deployed
 * contract while the Vault rows stay behind. Reads against those addresses come
 * back as empty data, which the contract layer reports as a decoding failure —
 * once per vault per request, in wording that reads like an ABI bug rather than
 * "this contract is gone".
 *
 * The answer is cached for the process lifetime: an address that has no code
 * will not grow any within this run, and one that has code does not lose it.
 * That also bounds the warning to a single line per vault instead of one per
 * request.
 *
 * An RPC failure is deliberately *not* treated as "no code" and is not cached —
 * a network hiccup must never make the backend silently skip a real vault.
 */
@Injectable()
export class VaultCodeService {
  private readonly logger = new Logger(VaultCodeService.name);
  private readonly present = new Map<string, boolean>();

  constructor(private readonly configService: ConfigService) {}

  async hasCode(vaultAddress: string): Promise<boolean> {
    const key = vaultAddress.toLowerCase();
    const cached = this.present.get(key);
    if (cached !== undefined) return cached;

    const rpcUrl = this.configService.get<string>('RPC_URL')!;
    const provider = new JsonRpcProvider(rpcUrl);
    try {
      const code = await provider.getCode(vaultAddress);
      const hasCode = code !== '0x' && code !== '0x0';
      this.present.set(key, hasCode);

      if (!hasCode) {
        this.logger.warn(
          `Vault ${vaultAddress} does not exist on this chain instance — no code ` +
            `at that address. The most likely cause is a restarted fork: the ` +
            `database survived, the chain state did not. On-chain reads for this ` +
            `vault are skipped for the rest of this run.`,
        );
      }
      return hasCode;
    } catch (err) {
      // Unreachable RPC is not evidence of a missing contract. Assume the vault
      // is there, leave the cache untouched, and let the caller's own error
      // handling deal with the failing read.
      this.logger.warn(
        `Could not check whether vault ${vaultAddress} has code: ${err}`,
      );
      return true;
    } finally {
      await provider.destroy();
    }
  }
}
