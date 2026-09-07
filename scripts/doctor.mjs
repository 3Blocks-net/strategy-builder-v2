#!/usr/bin/env node
// `pnpm dev:doctor` — checks the machine, changes nothing.
//
// Everything here is a read: no container is started, no file is written, no
// deployment is triggered. It exists for the moment before `pnpm dev`, and for
// the moment after it went wrong, when the question is "what about this machine
// is not right" rather than "how do I get it running".
//
// Gathering the observations lives here; judging them lives in
// `lib/doctor-report.mjs`, where it can be tested without a Docker daemon.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { resolve } from 'node:path';
import { checkFork } from './fork-check.mjs';
import { findAddressPinConflicts } from './lib/address-pins.mjs';
import { probeArchiveRpc } from './lib/chain.mjs';
import { readDeployOutput } from './lib/deploy-output.mjs';
import { buildDoctorReport, renderReport, reportExitCode } from './lib/doctor-report.mjs';
import { readEnvEntries, readEnvValue } from './lib/env-file.mjs';
import { parseMinimumNodeVersion } from './lib/version.mjs';

const root = resolve(import.meta.dirname, '..');
const backendEnv = resolve(root, 'packages/backend/.env');
const contractsEnv = resolve(root, 'packages/contracts/.env');
const POSTGRES_PORT = 5432;

const dockerRunning = isDockerRunning();
const fork = await checkFork({ envFilePath: backendEnv });

const findings = buildDoctorReport({
  node: {
    actual: process.version,
    minimum: parseMinimumNodeVersion(
      JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).engines?.node,
    ),
  },
  docker: dockerRunning,
  postgresPort: await inspectPostgresPort(dockerRunning.running),
  envFiles: [
    envFile('backend', 'packages/backend/.env'),
    envFile('frontend', 'packages/frontend/.env'),
    envFile('contracts', 'packages/contracts/.env'),
  ],
  addressPins: findAddressPinConflicts({
    entries: readEnvEntries(backendEnv),
    env: process.env,
    deployment: readDeployOutput(root),
  }),
  archiveRpc: await inspectArchiveRpc(),
  fork: { rpcUrl: fork.rpcUrl, reachable: fork.reachable },
});

console.log(renderReport(findings));
process.exit(reportExitCode(findings));

// ── Observations ────────────────────────────────────────────────────────────

function isDockerRunning() {
  try {
    execFileSync('docker', ['info'], { stdio: 'ignore' });
    return { running: true };
  } catch (err) {
    return { running: false, error: `\`docker info\` failed (${err.message.split('\n')[0]})` };
  }
}

/**
 * Is port 5432 taken, and by whom?
 *
 * "Port already allocated" is the error the developer sees; the culprit is
 * usually a PostgreSQL container of an entirely different project. Naming it —
 * container name and image, or the listening process — turns a dead end into a
 * one-line fix.
 */
async function inspectPostgresPort(dockerAvailable) {
  const inUse = await isPortListening(POSTGRES_PORT);
  if (!inUse) return { port: POSTGRES_PORT, inUse: false };

  const containers = dockerAvailable ? listContainersOnPort(POSTGRES_PORT) : [];
  const ownContainerId = dockerAvailable ? ownDatabaseContainerId() : null;
  if (containers.length > 0) {
    const isOwnStack = Boolean(
      ownContainerId && containers.some((container) => container.id.startsWith(ownContainerId.slice(0, 12))),
    );
    const names = containers.map((container) => `${container.name} (${container.image})`).join(', ');
    return {
      port: POSTGRES_PORT,
      inUse: true,
      isOwnStack,
      holder: isOwnStack
        ? `Docker container ${names}.`
        : `Held by the Docker container ${names} — not part of this project.`,
    };
  }

  const listener = describeListeningProcess(POSTGRES_PORT);
  return {
    port: POSTGRES_PORT,
    inUse: true,
    isOwnStack: false,
    holder: listener ? `Held by ${listener}.` : null,
  };
}

function isPortListening(port, { timeoutMs = 1000 } = {}) {
  return new Promise((done) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    const settle = (listening) => {
      socket.destroy();
      done(listening);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => settle(true));
    socket.once('timeout', () => settle(false));
    socket.once('error', () => settle(false));
  });
}

function listContainersOnPort(port) {
  const output = tryCommand('docker', [
    'ps',
    '--filter',
    `publish=${port}`,
    '--format',
    '{{.ID}}\t{{.Names}}\t{{.Image}}',
  ]);
  if (!output) return [];
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [id, name, image] = line.split('\t');
      return { id, name, image };
    });
}

function ownDatabaseContainerId() {
  const output = tryCommand('docker', ['compose', 'ps', '-q', 'db'], root);
  return output ? output.split('\n')[0].trim() || null : null;
}

function describeListeningProcess(port) {
  const output = tryCommand('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-F', 'cn']);
  if (!output) return null;
  const command = /^c(.+)$/m.exec(output)?.[1];
  return command ? `the process \`${command}\` listening on port ${port}` : null;
}

function tryCommand(command, args, cwd) {
  try {
    return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

function envFile(label, relativePath) {
  return {
    label,
    path: relativePath,
    template: `${relativePath}.example`,
    exists: existsSync(resolve(root, relativePath)),
  };
}

/**
 * `BSC_MAINNET_RPC_URL` has to serve historical state; a public endpoint does
 * not, and only says so much later, as the fork's "missing trie node".
 * Probing costs one round trip and is skipped when nothing is configured.
 */
async function inspectArchiveRpc() {
  const url = readEnvValue(contractsEnv, 'BSC_MAINNET_RPC_URL');
  if (!url) return { configured: false };
  const probe = await probeArchiveRpc(url);
  return { configured: true, url, status: probe.status, detail: probe.detail };
}
