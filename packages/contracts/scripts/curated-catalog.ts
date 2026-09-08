/**
 * Curating the deployed step catalog on a local chain.
 *
 * A vault in standard mode deploys an automation only against targets that the
 * CuratedRegistry lists — and it asks the list for the step's OWN kind. That
 * split is the point of the registry: a condition is reached by `staticcall`
 * and cannot write, an action is reached by `delegatecall` and writes into the
 * vault's own storage. Curating every target under both kinds would be the
 * convenient shortcut and would hand back exactly the hole the registry closes:
 * every reviewed condition would become a legal `delegatecall` target.
 *
 * So each target is curated under one kind, and the kind is derived — not typed
 * out by hand next to the deploy call, where it would rot the first time a
 * contract moves between folders.
 *
 * Where the kind comes from
 * ─────────────────────────
 * From the contract's own interface, which is the same thing the vault
 * dispatches on:
 *
 *   • condition — a read-only `(bytes, bytes[]) → (bool)` entry point
 *     (`ICondition.check`), which the vault `staticcall`s.
 *   • action — a state-changing `(bytes, bytes[]) → (uint32[], bytes[])` entry
 *     point (`IAction.execute`), which the vault `delegatecall`s.
 *
 * Shape, not function name: `IAction` allows an action contract to expose its
 * entry point under any name, and a name check would quietly misfile the first
 * one that uses that freedom. `IUpdatableCondition.afterExecution` has an
 * action-shaped signature but is `view`, so the read-only test keeps it on the
 * condition side.
 *
 * A contract that answers to both or to neither is not classified but throws:
 * the deploy stops with a name rather than curating a guess.
 */

// ─── Target kinds ──────────────────────────────────────────────────────────

/** Mirrors `ICuratedRegistry.TargetKind` (Condition = 0, Action = 1). */
export const CONDITION_KIND = 0;
export const ACTION_KIND = 1;

export type TargetKind = typeof CONDITION_KIND | typeof ACTION_KIND;

/** A deployed step target, ready to be curated. */
export interface CatalogTarget {
  /** Contract name, used for log lines and error messages. */
  name: string;
  address: string;
  kind: TargetKind;
}

// ─── Classification ────────────────────────────────────────────────────────

interface AbiParameterLike {
  type: string;
}

interface FragmentLike {
  type: string;
  stateMutability?: string;
  inputs?: readonly AbiParameterLike[];
  outputs?: readonly AbiParameterLike[];
}

/** The minimum of an ethers `Interface` this module needs. */
export interface InterfaceLike {
  fragments: readonly FragmentLike[];
}

const STEP_INPUTS = "bytes,bytes[]";
const CONDITION_OUTPUTS = "bool";
const ACTION_OUTPUTS = "uint32[],bytes[]";

function typeList(params: readonly AbiParameterLike[] | undefined): string {
  return (params ?? []).map((p) => p.type).join(",");
}

/**
 * Decide which curated list `contractName` belongs on, from its interface.
 *
 * @throws if the interface carries both entry points or neither — a target
 *         whose kind is ambiguous must not be curated on a guess.
 */
export function classifyTarget(contractName: string, iface: InterfaceLike): TargetKind {
  let isCondition = false;
  let isAction = false;

  for (const fragment of iface.fragments) {
    if (fragment.type !== "function") continue;
    if (typeList(fragment.inputs) !== STEP_INPUTS) continue;

    const readOnly =
      fragment.stateMutability === "view" || fragment.stateMutability === "pure";
    const outputs = typeList(fragment.outputs);

    if (readOnly && outputs === CONDITION_OUTPUTS) isCondition = true;
    if (!readOnly && outputs === ACTION_OUTPUTS) isAction = true;
  }

  if (isCondition && isAction) {
    throw new Error(
      `${contractName} exposes both a condition and an action entry point — ` +
        `its curated kind is ambiguous. Split the contract; do not curate it under both kinds.`,
    );
  }
  if (isCondition) return CONDITION_KIND;
  if (isAction) return ACTION_KIND;

  throw new Error(
    `${contractName} exposes neither a condition entry point ` +
      `((bytes,bytes[]) view returns (bool)) nor an action entry point ` +
      `((bytes,bytes[]) returns (uint32[],bytes[])), so it is not a step target. ` +
      `Protocol registries and other support contracts must not be curated.`,
  );
}

/** Build a `CatalogTarget` from a deployed contract's name, address and interface. */
export function toCatalogTarget(
  name: string,
  address: string,
  iface: InterfaceLike,
): CatalogTarget {
  return { name, address, kind: classifyTarget(name, iface) };
}

// ─── Writing the lists ─────────────────────────────────────────────────────

/** The slice of the CuratedRegistry this module drives. */
export interface CuratedRegistryLike {
  curator(): Promise<string>;
  isCurated(target: string, kind: TargetKind): Promise<boolean>;
  addCuratedTarget(
    target: string,
    kind: TargetKind,
  ): Promise<{ wait(): Promise<unknown> }>;
}

/**
 * Bridge from ethers' untyped `Contract` to the four members this module calls.
 *
 * Hardhat is set up without generated contract types here, so a deployed
 * contract arrives typed as `BaseContract` with no methods on it. The cast lives
 * in exactly this one place and states what the contract has to be, instead of
 * being sprinkled over the call sites.
 */
export function asCuratedRegistry(contract: unknown): CuratedRegistryLike {
  return contract as CuratedRegistryLike;
}

const KIND_LABEL: Record<TargetKind, string> = {
  [CONDITION_KIND]: "condition",
  [ACTION_KIND]: "action",
};

/**
 * Curate every target under its own kind.
 *
 * Idempotent on purpose. `addCuratedTarget` reverts with `TargetAlreadyCurated`
 * — deliberately, so a curator never believes a no-op was a change — but a
 * deploy script is not a curator at a keyboard: `deploy-defi-actions.ts` adds
 * contracts to a registry that may already know some of them, and a rerun must
 * not die halfway through with the chain half-curated. So the state is read
 * first and an already-listed target is reported as skipped.
 *
 * @param curator The address that will send the transactions. Curating is
 *        curator-only, so a mismatch is caught here, before the first send,
 *        with a message that names both addresses.
 */
export async function curateTargets(
  registry: CuratedRegistryLike,
  targets: readonly CatalogTarget[],
  curator: string,
  log: (line: string) => void = console.log,
): Promise<void> {
  const onChainCurator = await registry.curator();
  if (onChainCurator.toLowerCase() !== curator.toLowerCase()) {
    throw new Error(
      `Cannot curate: the registry's curator is ${onChainCurator}, but this script signs as ` +
        `${curator}. On a local chain the deployer holds the curator role; against a registry ` +
        `curated by someone else, run the curation with that key.`,
    );
  }

  for (const target of targets) {
    const label = `${target.name} (${KIND_LABEL[target.kind]})`;
    if (await registry.isCurated(target.address, target.kind)) {
      log(`  already curated: ${label}`);
      continue;
    }
    await (await registry.addCuratedTarget(target.address, target.kind)).wait();
    log(`  curated ${label}: ${target.address}`);
  }
}

// ─── The record written to the deployment file ─────────────────────────────

/**
 * The curated lists as they go into `deployments/fork-latest.json`.
 *
 * The seed reads this instead of querying the chain. Deliberate: the seed's
 * contract addresses already come from this file and nothing else, so curation
 * is recorded by the same run, at the same freshness, and `pnpm db:seed` keeps
 * working without a reachable RPC endpoint. See the seed's own note.
 */
export interface CurationRecord {
  registry: string;
  conditions: string[];
  actions: string[];
}

export function curationRecord(
  registryAddress: string,
  targets: readonly CatalogTarget[],
): CurationRecord {
  return {
    registry: registryAddress,
    conditions: targets.filter((t) => t.kind === CONDITION_KIND).map((t) => t.address),
    actions: targets.filter((t) => t.kind === ACTION_KIND).map((t) => t.address),
  };
}

function unique(addresses: readonly string[]): string[] {
  const seen = new Map<string, string>();
  for (const address of addresses) {
    const key = address.toLowerCase();
    if (!seen.has(key)) seen.set(key, address);
  }
  return [...seen.values()];
}

/**
 * Fold a fresh record into whatever the deployment file already carried.
 *
 * Incremental deploys add targets to a registry that keeps the ones already on
 * it, so the file has to keep them too — replacing the record would report the
 * base catalog as uncurated when it is not. A record for a different registry
 * address describes a different chain state and is dropped rather than merged.
 */
export function mergeCurationRecords(
  previous: Partial<CurationRecord> | undefined,
  next: CurationRecord,
): CurationRecord {
  const sameRegistry =
    previous?.registry?.toLowerCase() === next.registry.toLowerCase();

  return {
    registry: next.registry,
    conditions: unique([
      ...(sameRegistry ? (previous?.conditions ?? []) : []),
      ...next.conditions,
    ]),
    actions: unique([
      ...(sameRegistry ? (previous?.actions ?? []) : []),
      ...next.actions,
    ]),
  };
}
