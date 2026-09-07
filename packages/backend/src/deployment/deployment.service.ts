import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CHAIN_ID_PROBE, ChainIdProbe } from './chain-id.probe';
import {
  DEPLOYMENT_ADDRESS_NAMES,
  DEPLOYMENT_ADDRESS_SPECS,
  DeploymentAddressName,
  DeploymentFile,
  describeAddressSources,
  ResolvedAddresses,
  resolveDeploymentAddresses,
} from './deployment-addresses';

/** Injection token for the deploy-output reader (stubbed in tests). */
export const DEPLOYMENT_FILE = 'DEPLOYMENT_FILE';

/**
 * The one place that knows where a deployment address comes from (issue #30).
 *
 * Resolved at construction, and outside production resolved again whenever the
 * deploy output has changed since the last look (issue #31: after a redeploy a
 * page reload has to be enough — a backend restart is not part of the deal).
 * The stamp is a timestamp, so the ordinary case costs one `stat` and the log
 * line that says which source won is still written only when it changes.
 *
 * Production is deliberately untouched by this: there the file is never read,
 * the addresses come from the environment, and a missing one fails loudly at
 * startup instead of quietly running against a local fork's addresses.
 */
@Injectable()
export class DeploymentService {
  private readonly logger = new Logger(DeploymentService.name);
  private readonly isProduction: boolean;
  private readonly env: Record<string, string | undefined> = {};
  private addresses: ResolvedAddresses;
  private fileStamp: string | null;
  private describedSources: string | null = null;
  private chainIdLookup: Promise<number> | null = null;

  constructor(
    private readonly config: ConfigService,
    @Inject(DEPLOYMENT_FILE) private readonly file: DeploymentFile,
    @Inject(CHAIN_ID_PROBE) private readonly probeChainId: ChainIdProbe,
  ) {
    this.isProduction = this.config.get<string>('NODE_ENV') === 'production';
    for (const name of DEPLOYMENT_ADDRESS_NAMES) {
      const variable = DEPLOYMENT_ADDRESS_SPECS[name].envVariable;
      this.env[variable] = this.config.get<string>(variable);
    }

    this.fileStamp = this.currentStamp();
    this.addresses = this.resolve();

    if (this.isProduction) {
      const problems = DEPLOYMENT_ADDRESS_NAMES.flatMap((name) => {
        const entry = this.addresses[name];
        return entry.ok ? [] : [entry.problem];
      });
      if (problems.length > 0) {
        throw new Error(
          `Deployment addresses are not configured: ${problems.join(' ')}`,
        );
      }
    }
  }

  /**
   * The resolved address, or a failure that names the next step. The full
   * problem — including where the deploy output lives on this machine — goes to
   * the log; what leaves the process names no local path (`GET /config` needs
   * no login). Callers that cannot act on a missing address use
   * {@link tryGetAddress} instead.
   */
  getAddress(name: DeploymentAddressName): string {
    const entry = this.current()[name];
    if (!entry.ok) {
      this.logger.error(entry.problem);
      throw new ServiceUnavailableException(entry.publicProblem);
    }
    return entry.address;
  }

  /** The resolved address, or `null` for callers that stay dormant without it. */
  tryGetAddress(name: DeploymentAddressName): string | null {
    const entry = this.current()[name];
    return entry.ok ? entry.address : null;
  }

  /**
   * Why an address is unavailable — for callers that report rather than throw.
   * This is the log wording and may name the file's absolute path; anything
   * answered to a client goes through {@link getAddress}.
   */
  describeProblem(name: DeploymentAddressName): string | null {
    const entry = this.current()[name];
    return entry.ok ? null : entry.problem;
  }

  /**
   * The addresses as they are right now. Outside production a changed deploy
   * output is picked up here — that is what makes a redeploy visible without a
   * restart.
   */
  private current(): ResolvedAddresses {
    if (this.isProduction) return this.addresses;
    const stamp = this.currentStamp();
    if (stamp !== this.fileStamp) {
      this.fileStamp = stamp;
      this.addresses = this.resolve();
    }
    return this.addresses;
  }

  private currentStamp(): string | null {
    return this.file.stamp?.() ?? null;
  }

  /** Applies the rule and logs the outcome — but only when it says something new. */
  private resolve(): ResolvedAddresses {
    const addresses = resolveDeploymentAddresses({
      env: this.env,
      isProduction: this.isProduction,
      file: this.file,
    });
    const described = describeAddressSources(addresses);
    if (described !== this.describedSources) {
      this.describedSources = described;
      this.logger.log(
        `Deployment addresses (${this.isProduction ? 'production: env only' : 'env, then deploy output'}) — ${described}`,
      );
    }
    return addresses;
  }

  /**
   * The chain the backend talks to. `CHAIN_ID` wins; otherwise the chain itself
   * is asked over `RPC_URL` — the only source that cannot drift away from the
   * addresses above. Looked up once and cached; a failed lookup is retried on
   * the next call, because the fork may simply not be running yet.
   */
  async getChainId(): Promise<number> {
    if (!this.chainIdLookup) {
      this.chainIdLookup = this.resolveChainId().catch((err) => {
        this.chainIdLookup = null;
        throw err;
      });
    }
    return this.chainIdLookup;
  }

  private async resolveChainId(): Promise<number> {
    const configured = this.config.get<string>('CHAIN_ID')?.trim();
    if (configured) {
      const parsed = Number(configured);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new ServiceUnavailableException(
          `CHAIN_ID is set but is not a chain id ("${configured}").`,
        );
      }
      this.logger.log(`Chain id ${parsed} from env CHAIN_ID`);
      return parsed;
    }

    const rpcUrl = this.config.get<string>('RPC_URL')?.trim();
    if (!rpcUrl) {
      throw new ServiceUnavailableException(
        'Neither CHAIN_ID nor RPC_URL is set — the chain id is unknown. Set RPC_URL to the chain the backend talks to, or CHAIN_ID directly.',
      );
    }

    try {
      const chainId = await this.probeChainId(rpcUrl);
      this.logger.log(`Chain id ${chainId} read from the chain at ${rpcUrl}`);
      return chainId;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new ServiceUnavailableException(
        `The chain id could not be read from ${rpcUrl} (${reason}). Start the local fork with \`pnpm contracts:fork:bsc\`, or set CHAIN_ID.`,
      );
    }
  }
}
