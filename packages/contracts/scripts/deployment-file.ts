import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));

/**
 * Where a deploy records the addresses it just put on chain — the one file the
 * backend seed, the backend's deployment endpoint and the dev tooling all read.
 *
 * Overridable via `DEPLOYMENT_OUT`, and that goes hand in hand with
 * `LOCALHOST_RPC_URL` in hardhat.config.ts: the moment a second local chain can
 * be deployed to, its addresses must be able to land somewhere other than the
 * default. Otherwise a deploy meant for a scratch chain silently rewrites the
 * record a running dev session is reading, and every tool points at contracts on
 * a chain it is not talking to.
 */
export function deploymentOutputPath(): string {
  const override = process.env.DEPLOYMENT_OUT;
  return override ? resolve(override) : join(scriptsDir, "../deployments/fork-latest.json");
}
