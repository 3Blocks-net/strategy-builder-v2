import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildDoctorReport, FAIL, OK, renderReport, reportExitCode, WARN } from './doctor-report.mjs';

/** A machine on which everything is in order; each test spoils exactly one thing. */
function healthyObservations(overrides = {}) {
  return {
    node: { actual: 'v22.22.0', minimum: '22.22.0' },
    docker: { running: true },
    postgresPort: { port: 5432, inUse: false },
    envFiles: [
      { label: 'backend', path: 'packages/backend/.env', template: 'packages/backend/.env.example', exists: true },
    ],
    archiveRpc: { configured: true, status: 'archive', detail: 'historical state at block 1 is served' },
    fork: { rpcUrl: 'http://localhost:8545', reachable: true },
    ...overrides,
  };
}

function findingById(observations, id) {
  return buildDoctorReport(observations).find((finding) => finding.id === id);
}

const STALE_FACTORY = '0xDc4667177bcB8e0763283aF356873f2963470Fb8';
const DEPLOYED_FACTORY = '0xD3Af54Ad7aA6798DFebe68cA7858157F8FE6a3f6';

describe('buildDoctorReport', () => {
  it('reports a healthy machine without a single problem', () => {
    const findings = buildDoctorReport(healthyObservations());
    assert.ok(findings.every((finding) => finding.status === OK));
    assert.equal(reportExitCode(findings), 0);
  });

  it('names who holds port 5432 and how to get it back', () => {
    const finding = findingById(
      healthyObservations({
        postgresPort: {
          port: 5432,
          inUse: true,
          isOwnStack: false,
          holder: 'Held by the Docker container other-project-db (postgres:17-alpine) — not part of this project.',
        },
      }),
      'postgres-port',
    );
    assert.equal(finding.status, FAIL);
    assert.match(finding.detail, /other-project-db/);
    assert.match(finding.nextStep, /docker stop/);
  });

  it('does not complain when this project holds port 5432 itself', () => {
    const finding = findingById(
      healthyObservations({
        postgresPort: {
          port: 5432,
          inUse: true,
          isOwnStack: true,
          holder: 'Docker container sb-db-1 (postgres:16-alpine).',
        },
      }),
      'postgres-port',
    );
    assert.equal(finding.status, OK);
  });

  it('warns about a Node version below the engines requirement', () => {
    const finding = findingById(
      healthyObservations({ node: { actual: 'v22.20.0', minimum: '22.22.0' } }),
      'node-version',
    );
    assert.equal(finding.status, WARN);
    assert.match(finding.title, /22\.20\.0/);
    assert.match(finding.nextStep, /22\.22\.0/);
  });

  it('fails when the archive RPC is missing, and names the variable and the file', () => {
    const finding = findingById(healthyObservations({ archiveRpc: { configured: false } }), 'archive-rpc');
    assert.equal(finding.status, FAIL);
    assert.match(finding.nextStep, /BSC_MAINNET_RPC_URL/);
    assert.match(finding.nextStep, /packages\/contracts\/\.env/);
  });

  it('fails when the configured RPC cannot serve historical state', () => {
    const finding = findingById(
      healthyObservations({
        archiveRpc: {
          configured: true,
          status: 'not-archive',
          detail: 'state at block 1 is not available (missing trie node)',
        },
      }),
      'archive-rpc',
    );
    assert.equal(finding.status, FAIL);
    assert.match(finding.detail, /missing trie node/);
    assert.match(finding.nextStep, /archive endpoint/);
  });

  it('fails when Docker is not running', () => {
    const finding = findingById(healthyObservations({ docker: { running: false } }), 'docker');
    assert.equal(finding.status, FAIL);
    assert.match(finding.nextStep, /Docker Desktop/);
  });

  it('names the copy command for a missing .env', () => {
    const finding = findingById(
      healthyObservations({
        envFiles: [
          { label: 'backend', path: 'packages/backend/.env', template: 'packages/backend/.env.example', exists: false },
        ],
      }),
      'env-backend',
    );
    assert.equal(finding.status, WARN);
    assert.match(finding.nextStep, /cp packages\/backend\/\.env\.example packages\/backend\/\.env/);
  });

  it('points at the fork command when no chain node answers', () => {
    const finding = findingById(
      healthyObservations({ fork: { rpcUrl: 'http://localhost:8545', reachable: false } }),
      'fork',
    );
    assert.equal(finding.status, WARN);
    assert.match(finding.nextStep, /pnpm contracts:fork:bsc/);
  });

  it('still names a next step for a probe result it did not foresee', () => {
    const finding = findingById(
      healthyObservations({ archiveRpc: { configured: true, status: 'something-unforeseen', detail: null } }),
      'archive-rpc',
    );
    assert.notEqual(finding.status, OK);
    assert.ok(finding.nextStep);
  });

  it('gives every problem a next step, whatever went wrong', () => {
    const brokenMachine = healthyObservations({
      node: { actual: 'v20.0.0', minimum: '22.22.0' },
      docker: { running: false },
      postgresPort: { port: 5432, inUse: true, isOwnStack: false, holder: null },
      envFiles: [
        { label: 'backend', path: 'packages/backend/.env', template: 'packages/backend/.env.example', exists: false },
        {
          label: 'contracts',
          path: 'packages/contracts/.env',
          template: 'packages/contracts/.env.example',
          exists: false,
        },
      ],
      archiveRpc: { configured: true, status: 'unreachable', detail: 'no answer within 8000 ms' },
      fork: { rpcUrl: 'http://localhost:8545', reachable: false },
    });
    const findings = buildDoctorReport(brokenMachine);
    for (const finding of findings.filter((f) => f.status !== OK)) {
      assert.ok(finding.nextStep, `finding ${finding.id} has no next step`);
    }
    assert.equal(reportExitCode(findings), 1);
  });
});

describe('reportExitCode', () => {
  it('fails only on a blocking finding, not on a warning', () => {
    const warnedOnly = buildDoctorReport(healthyObservations({ node: { actual: 'v22.20.0', minimum: '22.22.0' } }));
    assert.equal(reportExitCode(warnedOnly), 0);

    const blocked = buildDoctorReport(healthyObservations({ docker: { running: false } }));
    assert.equal(reportExitCode(blocked), 1);
  });
});

describe('renderReport', () => {
  it('prints every problem together with its next step', () => {
    const output = renderReport(buildDoctorReport(healthyObservations({ docker: { running: false } })));
    assert.match(output, /FAIL {2}Docker is not running\./);
    assert.match(output, /→ Start Docker Desktop/);
    assert.match(output, /1 blocking problem/);
  });

  it('says so plainly when there is nothing to fix', () => {
    assert.match(renderReport(buildDoctorReport(healthyObservations())), /Everything checks out/);
  });
});

describe('a .env that pins a contract address', () => {
  const conflict = {
    envVariable: 'FACTORY_ADDRESS',
    title: 'FACTORY_ADDRESS points somewhere else than the deployment.',
    detail: `packages/backend/.env line 28 pins the vault factory to ${STALE_FACTORY}, while the deploy output names ${DEPLOYED_FACTORY}.`,
    nextStep: `Delete or comment out FACTORY_ADDRESS in packages/backend/.env line 28, or set it to ${DEPLOYED_FACTORY}.`,
  };

  it('blocks, because nothing else would ever notice it', () => {
    const findings = buildDoctorReport(healthyObservations({ addressPins: [conflict] }));
    const finding = findings.find((entry) => entry.id === 'address-pin-FACTORY_ADDRESS');

    assert.equal(finding.status, FAIL);
    assert.match(finding.detail, /line 28/);
    assert.match(finding.nextStep, new RegExp(DEPLOYED_FACTORY));
    assert.equal(reportExitCode(findings), 1);
  });

  it('says so plainly when nothing is pinned', () => {
    const finding = findingById(healthyObservations(), 'address-pins');

    assert.equal(finding.status, OK);
  });
});
