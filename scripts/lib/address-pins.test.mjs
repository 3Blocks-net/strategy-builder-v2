import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findAddressPinConflicts } from './address-pins.mjs';

const DEPLOYED_FACTORY = '0xD3Af54Ad7aA6798DFebe68cA7858157F8FE6a3f6';
const DEPLOYED_FEE_REGISTRY = '0x056763F1393CB2d47FFB56C04BB08E6231d3b753';
const STALE_FACTORY = '0xDc4667177bcB8e0763283aF356873f2963470Fb8';

const deployment = {
  ok: true,
  path: '/repo/packages/contracts/deployments/fork-latest.json',
  addresses: {
    StrategyBuilderVaultFactory: DEPLOYED_FACTORY,
    FeeRegistry: DEPLOYED_FEE_REGISTRY,
  },
};

function conflictsFor(entries, env = {}) {
  return findAddressPinConflicts({ entries, env, deployment });
}

describe('findAddressPinConflicts', () => {
  it('catches a .env that pins a factory the deployment does not know', () => {
    const [conflict, ...rest] = conflictsFor({
      FACTORY_ADDRESS: { value: STALE_FACTORY, line: 28 },
    });

    assert.deepEqual(rest, []);
    assert.equal(conflict.envVariable, 'FACTORY_ADDRESS');
    assert.equal(conflict.pinned, STALE_FACTORY);
    assert.equal(conflict.deployed, DEPLOYED_FACTORY);
  });

  it('names the file, the line and both ways out', () => {
    const [conflict] = conflictsFor({ FACTORY_ADDRESS: { value: STALE_FACTORY, line: 28 } });

    assert.match(conflict.detail, /packages\/backend\/\.env line 28/);
    assert.match(conflict.detail, new RegExp(STALE_FACTORY));
    assert.match(conflict.detail, new RegExp(DEPLOYED_FACTORY));
    assert.match(conflict.detail, /fork-latest\.json/);
    assert.match(conflict.nextStep, /line 28/);
    assert.match(conflict.nextStep, new RegExp(DEPLOYED_FACTORY));
  });

  it('reports every pinned address, not just the first', () => {
    const conflicts = conflictsFor({
      FACTORY_ADDRESS: { value: STALE_FACTORY, line: 28 },
      FEE_REGISTRY_ADDRESS: { value: STALE_FACTORY, line: 29 },
    });

    assert.deepEqual(
      conflicts.map((conflict) => conflict.envVariable),
      ['FACTORY_ADDRESS', 'FEE_REGISTRY_ADDRESS'],
    );
  });

  it('stays quiet when the pinned address is the deployed one', () => {
    assert.deepEqual(conflictsFor({ FACTORY_ADDRESS: { value: DEPLOYED_FACTORY, line: 28 } }), []);
  });

  it('compares addresses regardless of their checksum casing', () => {
    assert.deepEqual(
      conflictsFor({ FACTORY_ADDRESS: { value: DEPLOYED_FACTORY.toLowerCase(), line: 28 } }),
      [],
    );
  });

  it('stays quiet when nothing is pinned — the deploy output is then the only source', () => {
    assert.deepEqual(conflictsFor({ RPC_URL: { value: 'http://localhost:8545', line: 3 } }), []);
  });

  it('follows the runtime precedence: a shell variable beats the file', () => {
    const [conflict] = conflictsFor(
      { FACTORY_ADDRESS: { value: DEPLOYED_FACTORY, line: 28 } },
      { FACTORY_ADDRESS: STALE_FACTORY },
    );

    assert.equal(conflict.pinned, STALE_FACTORY);
    assert.equal(conflict.line, null);
    assert.match(conflict.detail, /shell environment/);
    assert.match(conflict.nextStep, /Unset FACTORY_ADDRESS/);
  });

  it('says nothing without a deploy output — there is nothing to contradict', () => {
    const conflicts = findAddressPinConflicts({
      entries: { FACTORY_ADDRESS: { value: STALE_FACTORY, line: 28 } },
      deployment: { ok: false, reason: 'there is no deploy output' },
    });

    assert.deepEqual(conflicts, []);
  });

  it('skips an address the deploy output does not carry at all', () => {
    const conflicts = findAddressPinConflicts({
      entries: { FEE_REGISTRY_ADDRESS: { value: STALE_FACTORY, line: 29 } },
      deployment: { ok: true, path: deployment.path, addresses: { StrategyBuilderVaultFactory: DEPLOYED_FACTORY } },
    });

    assert.deepEqual(conflicts, []);
  });
});
