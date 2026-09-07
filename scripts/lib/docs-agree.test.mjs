// The two documents that tell a human how to start this project.
//
// They live next to the other script tests because they describe exactly what
// these scripts do: a setup guide that still asks for `VITE_FACTORY_ADDRESS`
// sends the reader straight into the failure the address resolution was built
// to end. Documentation that contradicts the code is a defect with a slow fuse,
// so it gets a test like anything else.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';

const root = resolve(import.meta.dirname, '..', '..');
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');

describe('the setup guide', () => {
  const guide = read('Dev-Setup-Anleitung.html');

  it('no longer asks for a factory address in the frontend .env', () => {
    assert.ok(
      !guide.includes('VITE_FACTORY_ADDRESS'),
      'the frontend reads the addresses from the backend, so no .env entry may be asked for',
    );
  });

  it('does not hand out a backend .env with pinned contract addresses', () => {
    assert.ok(!/^FACTORY_ADDRESS=/m.test(guide));
    assert.ok(!/^FEE_REGISTRY_ADDRESS=/m.test(guide));
  });

  it('says where the addresses come from instead', () => {
    assert.match(guide, /fork-latest\.json/);
    assert.match(guide, /GET \/config/);
  });
});

describe('CLAUDE.md', () => {
  const claude = read('CLAUDE.md');

  it('names the diagnosis command', () => {
    assert.match(claude, /pnpm dev:doctor/);
  });

  it('lists the script tests among the test commands', () => {
    assert.match(claude, /pnpm scripts:test/);
  });

  it('warns that a pinned address wins', () => {
    assert.match(claude, /FACTORY_ADDRESS/);
  });
});

describe('the commands the documentation promises', () => {
  const scripts = JSON.parse(read('package.json')).scripts;

  it('exist in package.json', () => {
    for (const command of ['dev', 'dev:doctor', 'scripts:test']) {
      assert.ok(scripts[command], `package.json has no "${command}" script`);
    }
  });

  // pnpm runs its own subcommand when a script shares the name, silently and
  // with exit 0. `pnpm doctor` did exactly that: the docs promised a machine
  // check, pnpm printed nothing, and nobody noticed because it "succeeded".
  // A script the documentation tells people to run must be reachable by the
  // spelling the documentation uses.
  const PNPM_BUILTINS = new Set([
    'add', 'audit', 'bin', 'config', 'dedupe', 'deploy', 'dlx', 'doctor',
    'env', 'exec', 'fetch', 'import', 'init', 'install', 'licenses', 'link',
    'list', 'outdated', 'pack', 'patch', 'prune', 'publish', 'rebuild',
    'remove', 'root', 'run', 'server', 'setup', 'store', 'unlink', 'update',
    'why',
  ]);
  // `test` and `start` are deliberately absent: pnpm forwards those to the
  // script of the same name, so they are not shadowed.

  it('are not shadowed by a pnpm subcommand of the same name', () => {
    const shadowed = Object.keys(scripts).filter((name) => PNPM_BUILTINS.has(name));
    assert.deepEqual(
      shadowed,
      [],
      `pnpm would run its own command instead of these scripts: ${shadowed.join(', ')}. ` +
        'Rename them, or the documented invocation silently does nothing.',
    );
  });
});
