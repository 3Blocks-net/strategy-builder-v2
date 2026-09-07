#!/usr/bin/env node
// One command from a running fork to a usable system.
//
// The phases below are ordered because each one needs the one before it: you
// cannot deploy without a chain, cannot migrate without a database, cannot seed
// without migrations, and cannot judge whether the whole thing is usable before
// the services answer. Running it twice is harmless — every phase either
// recognises that its work is already done or redoes it without a trace.
//
// The fork itself is not started here on purpose: it is a long-lived process
// that belongs in its own terminal.

import { execSync, spawn } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkFork } from './fork-check.mjs';
import { findAddressPinConflicts } from './lib/address-pins.mjs';
import { hasContractCode } from './lib/chain.mjs';
import { readDeployOutput } from './lib/deploy-output.mjs';
import { readEnvEntries, readEnvValue } from './lib/env-file.mjs';
import {
  DEPLOY_MODE,
  evaluateFinalCheck,
  parseDeployMode,
  planContractPhase,
} from './lib/startup-plan.mjs';
import { meetsMinimumVersion, parseMinimumNodeVersion } from './lib/version.mjs';
import { waitUntil } from './lib/wait.mjs';

const root = resolve(import.meta.dirname, '..');
const backendDir = resolve(root, 'packages/backend');
const backendEnv = resolve(backendDir, '.env');
const frontendEnv = resolve(root, 'packages/frontend/.env');

let shuttingDown = false;
const procs = [];
/** What became of the dev servers this run started — read by the final check. */
const services = [];

// Registered before anything is spawned: a Ctrl-C during the closing check must
// take the three dev servers with it, not leave them orphaned.
process.on('SIGINT', stopChildren);
process.on('SIGTERM', stopChildren);

// --check-fork-only (TASK-8): run only the fork-reachability check and exit —
// no Docker, no migrations, no dev servers. Exit 0 either way; prints the
// hint only when no chain node answers under RPC_URL.
if (process.argv.includes('--check-fork-only')) {
  const { hint } = await checkFork({ envFilePath: backendEnv });
  if (hint) console.log(hint);
  process.exit(0);
}

const deployMode = parseDeployMode(process.argv);
if (!deployMode.ok) fail(deployMode.problem, 'Run `pnpm dev --fresh` or `pnpm dev --no-deploy`, not both.');

// ── 1. Preflight ────────────────────────────────────────────────────────────
phase('1/6  Preflight');

checkNodeVersion();
ensureEnvFile(backendEnv, resolve(backendDir, '.env.example'), 'backend');
ensureEnvFile(frontendEnv, resolve(root, 'packages/frontend/.env.example'), 'frontend');
checkDocker();

const { rpcUrl, reachable, hint } = await checkFork({ envFilePath: backendEnv });
if (!reachable) fail(hint);
console.log(`Chain node answering at ${rpcUrl}.`);

// ── 2. Contracts ────────────────────────────────────────────────────────────
phase('2/6  Contracts');

const deployment = readDeployOutput(root);
const code =
  deployMode.mode === DEPLOY_MODE.auto && deployment.ok
    ? await hasContractCode(rpcUrl, deployment.factory)
    : null;
const contractPlan = planContractPhase({ mode: deployMode.mode, deployment, code });

console.log(contractPlan.headline);
if (contractPlan.detail) console.log(`  ${contractPlan.detail}`);
if (contractPlan.action === 'stop') fail('', contractPlan.nextStep);
if (contractPlan.action === 'deploy') {
  run('pnpm contracts:deploy:fork', root, 'The contract deployment failed.', [
    'The output above says why. A common cause is a fork that was restarted while a deploy was running —',
    'restart `pnpm contracts:fork:bsc` and try again.',
  ]);
  // Fresh contracts that the backend will then ignore are not a usable state.
  // The precedence rule stands — a set variable wins — but it must not win
  // silently over a deployment that happened five seconds ago.
  const conflicts = findAddressPinConflicts({
    entries: readEnvEntries(backendEnv),
    env: process.env,
    deployment: readDeployOutput(root),
  });
  if (conflicts.length > 0) {
    fail(
      'The contracts were just deployed, but a pinned address would send the backend somewhere else:',
      conflicts.flatMap((conflict) => [`  ${conflict.title}`, `  ${conflict.detail}`, conflict.nextStep, '']),
    );
  }
} else {
  // No deploy happened, so a pin is not necessarily wrong — someone may be
  // pointing at another deployment on purpose. But nothing else in the system
  // would ever mention it, and a stale pin looks exactly like a working setup
  // until reads come back empty. Say it, then carry on.
  const conflicts = findAddressPinConflicts({
    entries: readEnvEntries(backendEnv),
    env: process.env,
    deployment: readDeployOutput(root),
  });
  for (const conflict of conflicts) {
    console.log(`  ! ${conflict.title}`);
    console.log(`    ${conflict.detail}`);
    console.log(`    ${conflict.nextStep}`);
  }
  if (conflicts.length > 0) {
    console.log('    Continuing — the variable wins by design. `pnpm dev:doctor` lists this too.');
  }
}

// ── 3. Database ─────────────────────────────────────────────────────────────
phase('3/6  Database');

run('docker compose up -d db', root, 'PostgreSQL could not be started.', [
  'Port 5432 is most likely taken by another project. Run `pnpm dev:doctor` — it names who holds it.',
]);
await waitForPostgres();
run('npx prisma migrate dev --skip-generate', backendDir, 'The database migration failed.', [
  'The output above says why. `pnpm db:down && pnpm db:up` resets a database that drifted too far.',
]);

// ── 4. Catalog ──────────────────────────────────────────────────────────────
phase('4/6  Catalog');

run('pnpm db:seed', root, 'Seeding the step catalog failed.', [
  'Without the catalog the graph editor opens without a single building block.',
  'The seed reads the contract addresses from the deploy output — a failed deploy shows up here.',
]);

// ── 5. Services ─────────────────────────────────────────────────────────────
phase('5/6  Services');

run('pnpm --filter shared build', root, 'Building the shared package failed.', [
  'Frontend and backend both compile against its output, so nothing can start until this builds.',
]);

start('shared (watch)', 'shared:build:watch');
start('backend', 'backend:dev');
start('frontend', 'frontend:dev');
console.log('\n  Backend:  http://localhost:3001\n  Frontend: http://localhost:5173');

// ── 6. Final check ──────────────────────────────────────────────────────────
phase('6/6  Final check');

const port = readEnvValue(backendEnv, 'PORT') ?? '3001';
const backendUrl = `http://localhost:${port}`;
console.log(`Waiting for the backend at ${backendUrl} …`);

const verdict = evaluateFinalCheck({
  backend: await waitForBackend(backendUrl),
  catalog: await readCatalog(backendUrl),
  services,
});

if (verdict.ok) {
  console.log('Backend is answering and the step catalog is filled.');
} else {
  console.log('\nThe startup finished, but the system is not usable yet:\n');
  for (const problem of verdict.problems) {
    console.log(`  ! ${problem.title}`);
    console.log(`    → ${problem.nextStep}\n`);
  }
}

console.log(`\n  Backend:  ${backendUrl}\n  Frontend: http://localhost:5173\n`);

// ── Steps ───────────────────────────────────────────────────────────────────

function phase(title) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 60 - title.length))}`);
}

/**
 * Ends the startup with a problem and the way out. Never leaves the developer
 * to discover the cause from a follow-up error three phases later.
 */
function fail(problem, ...nextSteps) {
  if (problem) console.error(`\n${problem}`);
  for (const step of nextSteps.flat()) {
    if (step) console.error(step.startsWith(' ') ? step : `→ ${step}`);
  }
  console.error('');
  stopChildren();
  process.exit(1);
}

function run(command, cwd, problem, nextSteps = []) {
  try {
    execSync(command, { cwd, stdio: 'inherit' });
  } catch {
    fail(problem, nextSteps);
  }
}

/**
 * The engines range is a warning, not a stop: an older Node still runs the
 * stack, it just makes pnpm complain on every single command — which is easy to
 * misread as something being broken.
 */
function checkNodeVersion() {
  const engines = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).engines?.node;
  const minimum = parseMinimumNodeVersion(engines);
  if (minimum && !meetsMinimumVersion(process.version, minimum)) {
    console.log(`Note: Node ${process.version} is older than the required ${minimum}.`);
    console.log('  pnpm will warn on every command until this matches. Everything else still works.');
    return;
  }
  console.log(`Node ${process.version} is fine.`);
}

function ensureEnvFile(target, template, label) {
  if (existsSync(target)) return;
  if (!existsSync(template)) {
    fail(
      `The ${label} has no .env and no .env.example to create one from (${template}).`,
      `Restore ${template} from git.`,
    );
  }
  copyFileSync(template, target);
  console.log(`Created ${target} from .env.example — edit JWT_SECRET before going anywhere near production.`);
}

function checkDocker() {
  try {
    execSync('docker info', { stdio: 'ignore' });
    console.log('Docker is running.');
  } catch {
    fail('Docker is not running, so the database cannot be started.', 'Start Docker Desktop and run `pnpm dev` again.');
  }
}

async function waitForPostgres() {
  const result = await waitUntil({
    probe: () => {
      try {
        execSync('docker compose exec -T db pg_isready -U pecunity', { cwd: root, stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    },
    attempts: 30,
    intervalMs: 1000,
    cancelled: () => shuttingDown,
  });

  if (result.cancelled) stopNow();
  if (!result.ok) {
    fail(
      'PostgreSQL did not become ready within 30 seconds.',
      'Run `pnpm dev:doctor` — a container of another project on port 5432 is the usual reason.',
    );
  }
  console.log('PostgreSQL is ready.');
}

/**
 * Starts a dev server and keeps track of whether it is still alive. A child
 * that exits on its own — port 3001 taken by an earlier `pnpm dev` is the
 * everyday case — has to reach the closing verdict, otherwise the startup
 * reports success for a service that is not running.
 */
function start(label, script) {
  const service = { label, stopped: false, exitCode: null, signal: null };
  services.push(service);

  const child = spawn('pnpm', [script], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, FORCE_COLOR: '1' },
  });
  child.on('error', (err) => {
    service.stopped = true;
    console.error(`${label} could not be started: ${err.message}`);
  });
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    service.stopped = true;
    service.exitCode = code;
    service.signal = signal;
    console.error(`\n${label} stopped (${signal ? `killed by ${signal}` : `exit code ${code}`}).`);
  });
  procs.push(child);
  console.log(`Started ${label}.`);
}

/** Polls /health until the backend answers; it compiles first, so this takes a while. */
async function waitForBackend(backendUrl, { attempts = 60, intervalMs = 2000 } = {}) {
  const result = await waitUntil({
    probe: async () => (await getJson(`${backendUrl}/health`)).ok,
    attempts,
    intervalMs,
    cancelled: () => shuttingDown,
  });
  if (result.cancelled) stopNow();
  return { ok: result.ok, url: backendUrl };
}

/** How many building blocks the graph editor would find. */
async function readCatalog(backendUrl) {
  if (shuttingDown) return { ok: false, error: 'the startup was interrupted' };
  const answer = await getJson(`${backendUrl}/step-types`);
  if (!answer.ok) return { ok: false, error: answer.error };
  if (!Array.isArray(answer.body)) return { ok: false, error: '/step-types did not answer with a list' };
  return { ok: true, count: answer.body.length };
}

async function getJson(url, { timeoutMs = 4000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return { ok: false, error: `${url} answered HTTP ${response.status}` };
    return { ok: true, body: await response.json() };
  } catch (err) {
    return { ok: false, error: `${url} did not answer (${err.message})` };
  } finally {
    clearTimeout(timer);
  }
}

/** Ends the run after a Ctrl-C: the children are already on their way out. */
function stopNow() {
  console.log('\nStartup interrupted.');
  stopChildren();
  process.exit(130);
}

function stopChildren() {
  shuttingDown = true;
  for (const child of procs) child.kill('SIGTERM');
}

