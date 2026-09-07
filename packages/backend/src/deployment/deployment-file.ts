import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import {
  DeploymentFile,
  DeploymentFileContent,
  DEPLOYMENT_FILE_RELATIVE_PATH,
} from './deployment-addresses';

/**
 * Locates and reads the deploy output `fork-latest.json` (same file
 * `prisma/seed.ts` already seeds contract addresses from).
 *
 * The path is derived from the repository root rather than from a relative
 * `__dirname` hop, so it survives running from `src/` (ts-jest, `nest start`)
 * and from `dist/` (`node dist/main`) alike.
 */
export function createDeploymentFile(startDir: string = __dirname): DeploymentFile {
  const path = join(findRepoRoot(startDir), DEPLOYMENT_FILE_RELATIVE_PATH);
  return {
    path,
    load: (): DeploymentFileContent => readDeploymentFile(path),
    stamp: (): string | null => stampDeploymentFile(path),
  };
}

/**
 * What the file looked like the last time anyone asked: modification time and
 * size. A redeploy rewrites the file, so the marker changes — and a file that
 * does not exist (yet) has none, which is a change in its own right once it
 * appears.
 */
export function stampDeploymentFile(path: string): string | null {
  try {
    const stats = statSync(path);
    return `${stats.mtimeMs}:${stats.size}`;
  } catch {
    return null;
  }
}

export function readDeploymentFile(path: string): DeploymentFileContent {
  if (!existsSync(path)) {
    return { ok: false, reason: 'the file does not exist' };
  }
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch (err) {
    return { ok: false, reason: `it could not be read (${describe(err)})` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { ok: false, reason: `it is not valid JSON (${describe(err)})` };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: 'it does not contain a JSON object' };
  }
  return { ok: true, addresses: parsed as Record<string, unknown> };
}

/**
 * Walks up from `startDir` to the directory holding `pnpm-workspace.yaml`.
 * Falls back to the current working directory when the marker is missing (a
 * packaged deployment) — production never reads the file anyway, and the path
 * then still names something the operator recognises.
 */
export function findRepoRoot(startDir: string): string {
  let current = isAbsolute(startDir) ? startDir : resolve(startDir);
  for (;;) {
    if (existsSync(join(current, 'pnpm-workspace.yaml'))) return current;
    const parent = dirname(current);
    if (parent === current) return process.cwd();
    current = parent;
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
