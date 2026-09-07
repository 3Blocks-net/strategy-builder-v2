import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEPLOYMENT_ADDRESS_SPECS,
  DEPLOYMENT_FILE_RELATIVE_PATH,
} from './deployment-addresses';
import { createDeploymentFile, readDeploymentFile } from './deployment-file';

describe('reading the deploy output', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deployment-file-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function write(contents: string): string {
    const path = join(dir, 'fork-latest.json');
    writeFileSync(path, contents, 'utf-8');
    return path;
  }

  it('returns the addresses of a well-formed file', () => {
    const path = write('{"FeeRegistry":"0xabc"}');

    expect(readDeploymentFile(path)).toEqual({
      ok: true,
      addresses: { FeeRegistry: '0xabc' },
    });
  });

  it('reports a missing file instead of throwing', () => {
    const result = readDeploymentFile(join(dir, 'nope.json'));

    expect(result).toEqual({ ok: false, reason: 'the file does not exist' });
  });

  it('reports broken JSON instead of throwing', () => {
    const result = readDeploymentFile(write('{"FeeRegistry":'));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain('not valid JSON');
  });

  it('reports a file that is not a JSON object', () => {
    const result = readDeploymentFile(write('["0xabc"]'));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain('JSON object');
  });
});

describe('locating the deploy output', () => {
  it('finds it from the repository root, whether run from src or dist', () => {
    const fromSrc = createDeploymentFile(__dirname);
    const fromDist = createDeploymentFile(join(__dirname, '..', '..', 'dist'));

    expect(fromSrc.path).toBe(fromDist.path);
    expect(fromSrc.path).toContain(DEPLOYMENT_FILE_RELATIVE_PATH);
  });

  /**
   * Guards the seam this whole module exists for: the resolver's keys have to
   * be the keys the deploy script actually writes. A renamed contract would
   * otherwise only surface as a missing address at runtime.
   */
  it('holds every key the resolver looks up', () => {
    const content = createDeploymentFile(__dirname).load();

    expect(content.ok).toBe(true);
    if (!content.ok) return;
    for (const spec of Object.values(DEPLOYMENT_ADDRESS_SPECS)) {
      if (!spec.fileKey) continue;
      expect(typeof content.addresses[spec.fileKey]).toBe('string');
    }
  });
});
