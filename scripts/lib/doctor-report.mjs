// The judgement half of `pnpm dev:doctor`: observations in, findings out.
//
// Pure on purpose. Probing the machine (is Docker up, who holds port 5432) is
// slow and environment-dependent; deciding what a probe *means* and what the
// developer should do about it is neither, and it is the part worth testing.
//
// House rule, enforced by `buildDoctorReport`: a finding that is not `ok`
// carries a next step. A message that names a problem without naming the way
// out is half a message.

import { meetsMinimumVersion } from './version.mjs';

export const OK = 'ok';
export const WARN = 'warn';
export const FAIL = 'fail';

const SYMBOL = { [OK]: 'OK  ', [WARN]: 'WARN', [FAIL]: 'FAIL' };

/**
 * Turns the observations gathered by `doctor.mjs` into an ordered list of
 * findings. Order follows the order things break in: the toolchain, then the
 * services the startup needs, then the chain.
 */
export function buildDoctorReport(observations) {
  const findings = [
    nodeVersionFinding(observations.node),
    dockerFinding(observations.docker),
    postgresPortFinding(observations.postgresPort),
    ...envFileFindings(observations.envFiles ?? []),
    ...addressPinFindings(observations.addressPins ?? []),
    archiveRpcFinding(observations.archiveRpc),
    forkFinding(observations.fork),
  ];

  for (const finding of findings) {
    if (finding.status !== OK && !finding.nextStep) {
      throw new Error(`Finding "${finding.id}" reports a problem without a next step.`);
    }
  }
  return findings;
}

/** Renders the findings as the block `pnpm dev:doctor` prints. */
export function renderReport(findings) {
  const lines = ['', 'Environment check', '─'.repeat(60)];
  for (const finding of findings) {
    lines.push(`${SYMBOL[finding.status]}  ${finding.title}`);
    if (finding.detail) lines.push(`      ${finding.detail}`);
    if (finding.nextStep) lines.push(`      → ${finding.nextStep}`);
  }
  lines.push('─'.repeat(60));
  lines.push(summarise(findings));
  lines.push('');
  return lines.join('\n');
}

/** Exit code: only a blocking finding fails the command; a warning does not. */
export function reportExitCode(findings) {
  return findings.some((finding) => finding.status === FAIL) ? 1 : 0;
}

function summarise(findings) {
  const failures = findings.filter((f) => f.status === FAIL).length;
  const warnings = findings.filter((f) => f.status === WARN).length;
  if (failures === 0 && warnings === 0) return 'Everything checks out — `pnpm dev` should start cleanly.';
  const parts = [];
  if (failures > 0) parts.push(`${failures} blocking ${failures === 1 ? 'problem' : 'problems'}`);
  if (warnings > 0) parts.push(`${warnings} ${warnings === 1 ? 'warning' : 'warnings'}`);
  return `${parts.join(', ')}. Nothing was changed — the steps above are yours to run.`;
}

function nodeVersionFinding({ actual, minimum }) {
  if (!minimum) {
    return {
      id: 'node-version',
      status: WARN,
      title: 'Could not read the required Node version.',
      detail: 'The root package.json has no readable `engines.node` range.',
      nextStep: 'Restore `engines.node` in package.json so the required version is stated somewhere.',
    };
  }
  const satisfied = meetsMinimumVersion(actual, minimum);
  return {
    id: 'node-version',
    status: satisfied ? OK : WARN,
    title: satisfied
      ? `Node ${actual} meets the required ${minimum}.`
      : `Node ${actual} is older than the required ${minimum}.`,
    detail: satisfied ? null : 'pnpm prints an "Unsupported engine" warning on every command until this matches.',
    nextStep: satisfied ? null : `Install Node ${minimum} or newer (e.g. \`nvm install ${minimum} && nvm use ${minimum}\`).`,
  };
}

function dockerFinding({ running, error }) {
  return {
    id: 'docker',
    status: running ? OK : FAIL,
    title: running ? 'Docker is running.' : 'Docker is not running.',
    detail: running ? null : error ?? 'The Docker daemon did not answer.',
    nextStep: running ? null : 'Start Docker Desktop, then run `pnpm dev` (it brings PostgreSQL up itself).',
  };
}

/**
 * Port 5432 is the one that bites in practice: a PostgreSQL container of an
 * unrelated project holds it, `docker compose up -d db` fails, and the error
 * names the port but not the culprit. So the finding names the culprit.
 */
function postgresPortFinding({ port, inUse, holder, isOwnStack }) {
  if (!inUse) {
    return {
      id: 'postgres-port',
      status: OK,
      title: `Port ${port} is free for this project's database.`,
      detail: null,
      nextStep: null,
    };
  }
  if (isOwnStack) {
    return {
      id: 'postgres-port',
      status: OK,
      title: `Port ${port} is held by this project's own database.`,
      detail: holder,
      nextStep: null,
    };
  }
  return {
    id: 'postgres-port',
    status: FAIL,
    title: `Port ${port} is taken by something else.`,
    detail: holder ?? 'Another process is listening, but it could not be identified.',
    nextStep: `Stop that container or service (e.g. \`docker stop <name>\` for the container named above), or free port ${port} another way — this project's database cannot start while it is taken.`,
  };
}

function envFileFindings(envFiles) {
  return envFiles.map(({ label, path, exists, template }) => ({
    id: `env-${label}`,
    status: exists ? OK : WARN,
    title: exists ? `${label} .env is present.` : `${label} .env is missing (${path}).`,
    detail: exists ? null : 'Without it the package falls back to defaults that do not fit this setup.',
    nextStep: exists ? null : `Create it: \`cp ${template} ${path}\`, then fill in the values it asks for.`,
  }));
}

/**
 * A pinned address that contradicts the deploy output is the quietest breakage
 * in this setup: everything starts, and the backend works against contracts
 * that are not the deployed ones. Blocking, because nothing downstream — not a
 * deploy, not a seed, not a green health check — will notice it.
 */
function addressPinFindings(conflicts) {
  if (conflicts.length === 0) {
    return [
      {
        id: 'address-pins',
        status: OK,
        title: 'No .env pins a contract address against the deploy output.',
        detail: null,
        nextStep: null,
      },
    ];
  }
  return conflicts.map((conflict) => ({
    id: `address-pin-${conflict.envVariable}`,
    status: FAIL,
    title: conflict.title,
    detail: conflict.detail,
    nextStep: conflict.nextStep,
  }));
}

/**
 * Forking BSC needs an archive-capable endpoint. A public endpoint answers
 * ordinary calls fine and only fails once the fork asks for historical state —
 * as "missing trie node", far away from the actual cause.
 */
function archiveRpcFinding(archiveRpc) {
  const variable = 'BSC_MAINNET_RPC_URL';
  if (!archiveRpc?.configured) {
    return {
      id: 'archive-rpc',
      status: FAIL,
      title: `${variable} is not set.`,
      detail: 'The BSC fork cannot start without an archive-capable RPC endpoint.',
      nextStep: `Set ${variable} in packages/contracts/.env to an archive endpoint (BlastAPI, Alchemy, QuickNode). Public endpoints such as bsc-dataseed.binance.org fail with "missing trie node".`,
    };
  }
  if (archiveRpc.status === 'archive') {
    return {
      id: 'archive-rpc',
      status: OK,
      title: `${variable} serves historical state.`,
      detail: archiveRpc.detail,
      nextStep: null,
    };
  }
  if (archiveRpc.status === 'unchecked') {
    return {
      id: 'archive-rpc',
      status: WARN,
      title: `${variable} is set but was not checked.`,
      detail: archiveRpc.detail,
      nextStep:
        'Run `pnpm dev:doctor` again with network access to find out whether the endpoint can serve historical state.',
    };
  }
  if (archiveRpc.status === 'unreachable') {
    return {
      id: 'archive-rpc',
      status: FAIL,
      title: `${variable} is set but does not answer.`,
      detail: archiveRpc.detail,
      nextStep:
        'Check the URL and your network, or put a different archive endpoint into packages/contracts/.env.',
    };
  }
  return {
    id: 'archive-rpc',
    status: FAIL,
    title: `${variable} is not archive-capable.`,
    detail: archiveRpc.detail,
    nextStep:
      'Replace it in packages/contracts/.env with an archive endpoint (BlastAPI, Alchemy, QuickNode) — the fork fails with "missing trie node" otherwise.',
  };
}

function forkFinding({ rpcUrl, reachable }) {
  return {
    id: 'fork',
    status: reachable ? OK : WARN,
    title: reachable ? `A chain node answers at ${rpcUrl}.` : `No chain node answers at ${rpcUrl}.`,
    detail: reachable ? null : 'The fork is a long-lived process of its own and is not started by `pnpm dev`.',
    nextStep: reachable ? null : 'Start it in its own terminal: `pnpm contracts:fork:bsc`. Then run `pnpm dev`.',
  };
}
