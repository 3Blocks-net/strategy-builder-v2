/**
 * Deployment address resolution (issue #30).
 *
 * The same address used to live in three places — the deploy output, the
 * backend `.env` and the frontend `.env`. Copies drift silently. This module is
 * the single rule everyone reads through:
 *
 * 1. an explicit environment variable always wins,
 * 2. otherwise the deploy output `fork-latest.json` — but only outside
 *    production, because a production system must never quietly fall back to a
 *    file that describes a local fork,
 * 3. otherwise a clear problem statement that names the file and the fix.
 *
 * Pure and framework-free on purpose: the rule is testable without Nest, a file
 * system or a chain. Reading the file is the caller's job (`DeploymentFile`).
 *
 * Every failure comes in two wordings: `problem` for the server log, which may
 * name the absolute path of the file, and `publicProblem` for anything that
 * leaves the machine. `GET /config` needs no login, so its answer must name the
 * next step without describing where this server keeps its files.
 */

/** Where the deploy output lives, relative to the repository root. */
export const DEPLOYMENT_FILE_RELATIVE_PATH =
  'packages/contracts/deployments/fork-latest.json';

/** The command that (re-)writes the deploy output. */
export const DEPLOY_COMMAND = 'pnpm contracts:deploy:fork';

/**
 * PancakeSwap V3 factory on BSC. Not our deploy output — a live protocol
 * address that the BSC fork inherits from mainnet, so it has a known-good
 * default and never fails to resolve.
 */
export const PANCAKESWAP_V3_FACTORY_BSC =
  '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865';

export type DeploymentAddressName = 'factory' | 'feeRegistry' | 'pancakeFactory';

interface AddressSpec {
  /** Environment variable that overrides everything else. */
  readonly envVariable: string;
  /** Key in the deploy output; absent = not part of a deployment. */
  readonly fileKey?: string;
  /** Known-good default; absent = the address is required. */
  readonly fallback?: string;
  /** Human-readable name for log lines and problem statements. */
  readonly label: string;
}

export const DEPLOYMENT_ADDRESS_SPECS: Record<
  DeploymentAddressName,
  AddressSpec
> = {
  factory: {
    envVariable: 'FACTORY_ADDRESS',
    fileKey: 'StrategyBuilderVaultFactory',
    label: 'vault factory',
  },
  feeRegistry: {
    envVariable: 'FEE_REGISTRY_ADDRESS',
    fileKey: 'FeeRegistry',
    label: 'fee registry',
  },
  pancakeFactory: {
    envVariable: 'PCS_FACTORY_ADDRESS',
    fallback: PANCAKESWAP_V3_FACTORY_BSC,
    label: 'PancakeSwap V3 factory',
  },
};

export const DEPLOYMENT_ADDRESS_NAMES = Object.keys(
  DEPLOYMENT_ADDRESS_SPECS,
) as DeploymentAddressName[];

/** Result of reading the deploy output — a failure is a reason, never a throw. */
export type DeploymentFileContent =
  | { readonly ok: true; readonly addresses: Record<string, unknown> }
  | { readonly ok: false; readonly reason: string };

export interface DeploymentFile {
  /** Absolute path, used verbatim in log lines and problem statements. */
  readonly path: string;
  load(): DeploymentFileContent;
  /**
   * A marker that changes when the file does — a timestamp is enough. It lets a
   * long-running process notice a redeploy instead of serving the addresses it
   * read at start-up. `null` means "nothing to notice"; an implementation that
   * leaves it out is treated as never changing.
   */
  stamp?(): string | null;
}

export type ResolvedAddress =
  | { readonly ok: true; readonly address: string; readonly source: string }
  | {
      readonly ok: false;
      /** For the server log — may name the absolute path of the deploy output. */
      readonly problem: string;
      /** For callers outside the machine — same next step, no local paths. */
      readonly publicProblem: string;
    };

export type ResolvedAddresses = Record<DeploymentAddressName, ResolvedAddress>;

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

export interface ResolveInput {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly isProduction: boolean;
  readonly file: DeploymentFile;
}

/**
 * Applies the rule to every known address at once. The deploy output is read at
 * most once, and in production not at all.
 */
export function resolveDeploymentAddresses(
  input: ResolveInput,
): ResolvedAddresses {
  let cached: DeploymentFileContent | null = null;
  const loadFile = (): DeploymentFileContent => {
    if (cached === null) cached = input.file.load();
    return cached;
  };

  const resolved = {} as ResolvedAddresses;
  for (const name of DEPLOYMENT_ADDRESS_NAMES) {
    resolved[name] = resolveOne(DEPLOYMENT_ADDRESS_SPECS[name], input, loadFile);
  }
  return resolved;
}

function resolveOne(
  spec: AddressSpec,
  input: ResolveInput,
  loadFile: () => DeploymentFileContent,
): ResolvedAddress {
  const fromEnv = input.env[spec.envVariable]?.trim();
  if (fromEnv) {
    // A set variable wins even when it is wrong — silently falling through to
    // the file would hide the operator's typo behind a working system.
    if (!ADDRESS_PATTERN.test(fromEnv)) {
      return failure(
        `${spec.envVariable} is set but is not a contract address ("${fromEnv}"). Expected 0x followed by 40 hex characters.`,
      );
    }
    return { ok: true, address: fromEnv, source: `env ${spec.envVariable}` };
  }

  if (spec.fileKey && !input.isProduction) {
    const content = loadFile();
    if (content.ok) {
      const value = content.addresses[spec.fileKey];
      if (typeof value === 'string' && ADDRESS_PATTERN.test(value.trim())) {
        return {
          ok: true,
          address: value.trim(),
          source: `${input.file.path} (${spec.fileKey})`,
        };
      }
      return fileFailure(spec, input.file.path, {
        reason:
          value === undefined
            ? `it has no "${spec.fileKey}" entry`
            : `its "${spec.fileKey}" entry is not a contract address (${JSON.stringify(value)})`,
        publicReason:
          value === undefined
            ? `it has no "${spec.fileKey}" entry`
            : `its "${spec.fileKey}" entry is not a contract address`,
      });
    }
    // The file-level reason comes from the reader and can carry the path an
    // OS error mentioned, so it stays out of the public wording.
    return fileFailure(spec, input.file.path, { reason: content.reason });
  }

  if (spec.fallback) {
    return {
      ok: true,
      address: spec.fallback,
      source: 'built-in default (BSC mainnet)',
    };
  }

  if (spec.fileKey && input.isProduction) {
    return failure(
      `${spec.envVariable} is not set. In production the deployment file is never read — set ${spec.envVariable} to the deployed ${spec.label} address.`,
    );
  }

  return failure(
    `${spec.envVariable} is not set and there is no default for the ${spec.label} address.`,
  );
}

/** A failure whose wording gives nothing away, so both halves are the same. */
function failure(problem: string): ResolvedAddress {
  return { ok: false, problem, publicProblem: problem };
}

function fileFailure(
  spec: AddressSpec,
  path: string,
  { reason, publicReason }: { reason: string; publicReason?: string },
): ResolvedAddress {
  const fix = `Run \`${DEPLOY_COMMAND}\` to write a fresh deployment, or set ${spec.envVariable}.`;
  return {
    ok: false,
    problem: `${spec.envVariable} is not set, so the ${spec.label} address was looked up in ${path} — but ${reason}. ${fix}`,
    publicProblem: `${spec.envVariable} is not set, so the ${spec.label} address was looked up in the deploy output (${DEPLOYMENT_FILE_RELATIVE_PATH})${publicReason ? ` — but ${publicReason}` : ', which could not be used'}. ${fix}`,
  };
}

/** One line per address: which value came from where. Used for the startup log. */
export function describeAddressSources(resolved: ResolvedAddresses): string {
  return DEPLOYMENT_ADDRESS_NAMES.map((name) => {
    const entry = resolved[name];
    const label = DEPLOYMENT_ADDRESS_SPECS[name].label;
    return entry.ok
      ? `${label} ${entry.address} from ${entry.source}`
      : `${label} UNRESOLVED (${entry.problem})`;
  }).join('; ');
}
