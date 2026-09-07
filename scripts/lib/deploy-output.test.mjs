import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { DEPLOYMENT_FILE_RELATIVE_PATH, parseDeployOutput, readDeployOutput } from './deploy-output.mjs';

const FACTORY = '0x1111111111111111111111111111111111111111';
const FEE_REGISTRY = '0x2222222222222222222222222222222222222222';

function repoWith(contents) {
  const root = mkdtempSync(join(tmpdir(), 'deploy-output-test-'));
  if (contents !== null) {
    const path = join(root, DEPLOYMENT_FILE_RELATIVE_PATH);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  }
  return root;
}

describe('parseDeployOutput', () => {
  it('reads the factory address out of a deploy output', () => {
    assert.deepEqual(parseDeployOutput(JSON.stringify({ StrategyBuilderVaultFactory: FACTORY })), {
      ok: true,
      factory: FACTORY,
      addresses: { StrategyBuilderVaultFactory: FACTORY },
    });
  });

  it('keeps every address, so a pinned one can be compared against it', () => {
    const result = parseDeployOutput(
      JSON.stringify({ StrategyBuilderVaultFactory: FACTORY, FeeRegistry: FEE_REGISTRY }),
    );
    assert.equal(result.addresses.FeeRegistry, FEE_REGISTRY);
  });

  it('names the reason when the file is not JSON', () => {
    const result = parseDeployOutput('not json at all');
    assert.equal(result.ok, false);
    assert.match(result.reason, /not valid JSON/);
  });

  it('names the reason when the factory entry is missing', () => {
    const result = parseDeployOutput(JSON.stringify({ FeeRegistry: FACTORY }));
    assert.equal(result.ok, false);
    assert.match(result.reason, /StrategyBuilderVaultFactory/);
  });

  it('rejects an entry that is not a contract address', () => {
    assert.equal(parseDeployOutput(JSON.stringify({ StrategyBuilderVaultFactory: '0xabc' })).ok, false);
    assert.equal(parseDeployOutput(JSON.stringify({ StrategyBuilderVaultFactory: 42 })).ok, false);
  });
});

describe('readDeployOutput', () => {
  it('finds the deploy output below the repository root', () => {
    const result = readDeployOutput(repoWith(JSON.stringify({ StrategyBuilderVaultFactory: FACTORY })));
    assert.equal(result.ok, true);
    assert.equal(result.factory, FACTORY);
  });

  it('reports a missing file with the path it looked at', () => {
    const result = readDeployOutput(repoWith(null));
    assert.equal(result.ok, false);
    assert.ok(
      result.reason.includes(DEPLOYMENT_FILE_RELATIVE_PATH),
      `the reason should name the path it looked at, got: ${result.reason}`,
    );
  });
});
