/**
 * The seed's view of the on-chain curated list.
 *
 * A vault in standard mode only deploys automations against step targets that
 * the CuratedRegistry lists — and it asks the list for the step's own kind
 * (`CONDITION` is `staticcall`ed, `ACTION` is `delegatecall`ed). A catalog entry
 * whose contract is missing from its list still seeds fine and still shows up in
 * the editor, and then fails at deploy time with `StepTargetNotCurated`. This
 * module turns that late surprise into a line in the seed output.
 *
 * Where the answer comes from
 * ───────────────────────────
 * From the deployment file the deploy script writes, not from an RPC call. The
 * seed already takes every contract address from that one file and never touches
 * the chain, so:
 *
 *   • curation is recorded by the same run that deployed and curated, which
 *     makes it exactly as fresh as the addresses next to it — a file that is
 *     right about the addresses is right about the curation;
 *   • `pnpm db:seed` keeps working with no chain reachable (CI, a fresh clone,
 *     a stopped fork), which an RPC lookup would end;
 *   • there is one source of truth about a deploy rather than two that can
 *     disagree.
 *
 * The cost is honest: someone who curates or un-curates by hand after the deploy
 * makes the file stale, and the seed would then report the old state. That is
 * acceptable because this check is advisory — it warns, it never blocks — and
 * because hand-curation is the expert path, not the daily one.
 *
 * The kind is checked, not just the address: a target curated under the wrong
 * kind is reported as uncurated, which is also what the vault will do.
 */

export type StepKind = 'CONDITION' | 'ACTION';

/** The `curatedTargets` block of `deployments/fork-latest.json`. */
export interface CurationRecord {
  registry?: string;
  conditions?: readonly string[];
  actions?: readonly string[];
}

/** A catalog entry as the seed resolved it, with its deployed address. */
export interface SeededTarget {
  name: string;
  category: StepKind;
  contractAddress: string;
}

export type CurationWarning =
  /** The deployment carries no curated-target record at all. */
  | { kind: 'record-missing' }
  /** This target is not on the curated list for its own kind. */
  | { kind: 'target-uncurated'; name: string; category: StepKind; contractAddress: string };

function addressSet(addresses: readonly string[] | undefined): Set<string> {
  return new Set((addresses ?? []).map((a) => a.toLowerCase()));
}

/**
 * Report every seeded catalog entry a standard-mode vault would refuse.
 *
 * A missing record is reported once instead of once per entry: the cause is one
 * thing (a deployment written before curation existed, or by a path that does
 * not curate), and the fix is one thing.
 */
export function findCurationWarnings(
  targets: readonly SeededTarget[],
  record: CurationRecord | undefined | null,
): CurationWarning[] {
  if (!record) return [{ kind: 'record-missing' }];

  const curated: Record<StepKind, Set<string>> = {
    CONDITION: addressSet(record.conditions),
    ACTION: addressSet(record.actions),
  };

  return targets
    .filter((t) => !curated[t.category].has(t.contractAddress.toLowerCase()))
    .map(({ name, category, contractAddress }) => ({
      kind: 'target-uncurated' as const,
      name,
      category,
      contractAddress,
    }));
}

/** One human-readable line per warning, for the seed's console output. */
export function describeCurationWarning(warning: CurationWarning): string {
  if (warning.kind === 'record-missing') {
    return (
      'deployment file lists no curated targets — a standard-mode vault will reject ' +
      'every step. Re-run `pnpm contracts:deploy:fork`.'
    );
  }
  return (
    `"${warning.name}" (${warning.category}, ${warning.contractAddress}) is not curated — ` +
    'a standard-mode vault will reject it. Re-run `pnpm contracts:deploy:fork`.'
  );
}
