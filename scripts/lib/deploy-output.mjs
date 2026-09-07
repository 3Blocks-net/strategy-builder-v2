// Reading the vault factory address out of the deploy output.
//
// `packages/contracts/scripts/deploy-fork.ts` writes the file, the Prisma seed
// and the backend's deployment module read it (see
// `packages/backend/src/deployment/deployment-addresses.ts`, which owns the
// same relative path for the application side). The startup script cannot
// import that TypeScript, so it repeats the path and nothing else: it only
// needs one address, and only to ask the chain whether that address still
// carries code.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const DEPLOYMENT_FILE_RELATIVE_PATH = 'packages/contracts/deployments/fork-latest.json';
const FACTORY_KEY = 'StrategyBuilderVaultFactory';
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

/** Turns file contents into the factory address, or into the reason there is none. */
export function parseDeployOutput(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { ok: false, reason: `the deploy output is not valid JSON (${err.message})` };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: 'the deploy output does not contain a JSON object' };
  }
  const value = parsed[FACTORY_KEY];
  if (typeof value !== 'string' || !ADDRESS_PATTERN.test(value.trim())) {
    return { ok: false, reason: `the deploy output has no usable "${FACTORY_KEY}" address` };
  }
  return { ok: true, factory: value.trim(), addresses: parsed };
}

/** Locates and reads the deploy output below `rootDir`. */
export function readDeployOutput(rootDir) {
  const path = join(rootDir, DEPLOYMENT_FILE_RELATIVE_PATH);
  if (!existsSync(path)) {
    return { ok: false, reason: `there is no deploy output at ${path}`, path };
  }
  try {
    return { ...parseDeployOutput(readFileSync(path, 'utf8')), path };
  } catch (err) {
    return { ok: false, reason: `the deploy output at ${path} could not be read (${err.message})`, path };
  }
}
