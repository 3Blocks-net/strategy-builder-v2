import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { parseEnvFile, readEnvFile, readEnvValue } from './env-file.mjs';

function envFileWith(contents) {
  const dir = mkdtempSync(join(tmpdir(), 'env-file-test-'));
  const path = join(dir, '.env');
  writeFileSync(path, contents);
  return path;
}

describe('parseEnvFile', () => {
  it('reads plain key/value lines', () => {
    assert.deepEqual(parseEnvFile('RPC_URL=http://localhost:8545\nPORT=3001'), {
      RPC_URL: 'http://localhost:8545',
      PORT: '3001',
    });
  });

  it('ignores blank lines and comments', () => {
    assert.deepEqual(parseEnvFile('\n# a comment\n\nPORT=3001\n'), { PORT: '3001' });
  });

  it('strips quotes and an inline comment', () => {
    assert.deepEqual(parseEnvFile('RPC_URL="http://localhost:8545" # local fork'), {
      RPC_URL: 'http://localhost:8545',
    });
  });

  it('keeps a value that itself contains an equals sign', () => {
    assert.deepEqual(parseEnvFile('DATABASE_URL=postgresql://u:p@localhost:5432/db?schema=public'), {
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db?schema=public',
    });
  });

  it('treats an empty value as not set, so a placeholder line masks nothing', () => {
    assert.deepEqual(parseEnvFile('FACTORY_ADDRESS='), {});
  });
});

describe('readEnvFile', () => {
  it('reads an existing file', () => {
    assert.deepEqual(readEnvFile(envFileWith('PORT=3002')), { PORT: '3002' });
  });

  it('answers with an empty set for a missing file rather than throwing', () => {
    assert.deepEqual(readEnvFile('/definitely/not/here/.env'), {});
  });
});

describe('readEnvValue', () => {
  it('lets the process environment win over the file', () => {
    const path = envFileWith('RPC_URL=http://from-file:8545');
    assert.equal(readEnvValue(path, 'RPC_URL', { RPC_URL: 'http://from-env:8545' }), 'http://from-env:8545');
  });

  it('falls back to the file when the environment does not set the value', () => {
    const path = envFileWith('RPC_URL=http://from-file:8545');
    assert.equal(readEnvValue(path, 'RPC_URL', {}), 'http://from-file:8545');
  });

  it('reports an unknown key as undefined', () => {
    assert.equal(readEnvValue(envFileWith('PORT=3001'), 'RPC_URL', {}), undefined);
  });
});
