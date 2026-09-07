// Run with `pnpm scripts:test`. The workspace scripts belong to no package and
// pull in no dependencies, so they are tested with Node's own runner rather
// than adding a test framework to the repository root.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { meetsMinimumVersion, parseMinimumNodeVersion } from './version.mjs';

describe('meetsMinimumVersion', () => {
  it('accepts an equal or newer version, with or without the v prefix', () => {
    assert.equal(meetsMinimumVersion('22.22.0', '22.22.0'), true);
    assert.equal(meetsMinimumVersion('v22.22.1', '22.22.0'), true);
    assert.equal(meetsMinimumVersion('v23.0.0', '22.22.0'), true);
  });

  it('rejects an older version, including one that only differs in the patch', () => {
    assert.equal(meetsMinimumVersion('v22.20.0', '22.22.0'), false);
    assert.equal(meetsMinimumVersion('v22.21.9', '22.22.0'), false);
    assert.equal(meetsMinimumVersion('v21.99.99', '22.22.0'), false);
  });

  it('compares numerically rather than as text', () => {
    assert.equal(meetsMinimumVersion('v22.9.0', '22.22.0'), false);
    assert.equal(meetsMinimumVersion('v22.100.0', '22.22.0'), true);
  });

  it('treats an unreadable version as not satisfied instead of waving it through', () => {
    assert.equal(meetsMinimumVersion(undefined, '22.22.0'), false);
    assert.equal(meetsMinimumVersion('unknown', '22.22.0'), false);
    assert.equal(meetsMinimumVersion('v22.22.0', 'not a version'), false);
  });
});

describe('parseMinimumNodeVersion', () => {
  it('reads the version out of an engines range', () => {
    assert.equal(parseMinimumNodeVersion('>=22.22.0'), '22.22.0');
    assert.equal(parseMinimumNodeVersion('22.22.0'), '22.22.0');
  });

  it('reports a missing or unreadable range as null', () => {
    assert.equal(parseMinimumNodeVersion(undefined), null);
    assert.equal(parseMinimumNodeVersion('*'), null);
  });
});
