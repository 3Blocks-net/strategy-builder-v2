// A `.env` that pins a contract address the deploy output does not know.
//
// The precedence rule is deliberate and stays: an explicit environment variable
// beats the deploy output, in the backend and here. What must not stay is the
// silence around it. `FACTORY_ADDRESS=0x…` left over from an earlier fork makes
// `pnpm dev` deploy fresh contracts and the backend talk to the dead ones — a
// system that looks healthy from every angle and works from none.
//
// Pure on purpose: reading the files is the caller's job, so both `pnpm dev`
// (after it deployed) and `pnpm dev:doctor` (any time) can ask the same question.

/** The addresses that live in the deploy output and can be pinned by hand. */
export const PINNABLE_ADDRESSES = [
  {
    envVariable: 'FACTORY_ADDRESS',
    fileKey: 'StrategyBuilderVaultFactory',
    label: 'vault factory',
  },
  {
    envVariable: 'FEE_REGISTRY_ADDRESS',
    fileKey: 'FeeRegistry',
    label: 'fee registry',
  },
];

/**
 * Every pinned address that disagrees with the deploy output.
 *
 * `entries` is a parsed `.env` (`{ KEY: { value, line } }`), `env` the process
 * environment, which wins over the file exactly as it does at runtime.
 * Without a usable deploy output there is nothing to contradict, so the answer
 * is an empty list rather than a guess.
 *
 * Each conflict carries its own wording: what is wrong, where it is written,
 * and the two ways out.
 */
export function findAddressPinConflicts({
  entries = {},
  env = {},
  deployment,
  envFileLabel = 'packages/backend/.env',
}) {
  if (!deployment?.ok) return [];

  const conflicts = [];
  for (const spec of PINNABLE_ADDRESSES) {
    const deployed = String(deployment.addresses?.[spec.fileKey] ?? '').trim();
    if (!deployed) continue;

    const fromShell = env[spec.envVariable]?.trim();
    const entry = entries[spec.envVariable];
    const pinned = fromShell || entry?.value;
    if (!pinned) continue;
    if (pinned.toLowerCase() === deployed.toLowerCase()) continue;

    const where = fromShell
      ? 'the shell environment'
      : `${envFileLabel} line ${entry.line}`;
    conflicts.push({
      envVariable: spec.envVariable,
      label: spec.label,
      pinned,
      deployed,
      line: fromShell ? null : entry.line,
      where,
      title: `${spec.envVariable} points somewhere else than the deployment.`,
      detail:
        `${where} pins the ${spec.label} to ${pinned}, ` +
        `while ${deployment.path ?? 'the deploy output'} names ${deployed}. ` +
        'The variable wins, so the backend would work against contracts that are not the ones deployed here.',
      nextStep: fromShell
        ? `Unset ${spec.envVariable} in this shell (the address is then read from the deploy output), or export ${deployed}.`
        : `Delete or comment out ${spec.envVariable} in ${envFileLabel} line ${entry.line} (the address is then read from the deploy output), or set it to ${deployed}.`,
    });
  }
  return conflicts;
}
