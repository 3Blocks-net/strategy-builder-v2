// Minimal JSON-RPC access for the startup scripts.
//
// The scripts run before `packages/shared` is built and outside any package, so
// they cannot use ethers/viem. A single `fetch` POST covers everything they
// need: is a node answering, and does an address carry code?

const DEFAULT_TIMEOUT_MS = 3000;

/**
 * One JSON-RPC call. Never throws: an unreachable host, a timeout, an HTTP
 * error and a JSON-RPC error all come back as `{ ok: false, error }` so callers
 * can tell "the chain said no" apart from "the chain did not answer".
 */
export async function rpcCall(rpcUrl, method, params = [], { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal,
    });
    if (!response.ok) {
      return { ok: false, error: `${rpcUrl} answered HTTP ${response.status}` };
    }
    const body = await response.json();
    if (body?.error) {
      return { ok: false, error: String(body.error.message ?? body.error) };
    }
    if (body?.result === undefined) {
      return { ok: false, error: `${rpcUrl} did not answer ${method} with a result` };
    }
    return { ok: true, result: body.result };
  } catch (err) {
    const reason = err?.name === 'AbortError' ? `no answer within ${timeoutMs} ms` : err?.message;
    return { ok: false, error: `${rpcUrl} is not reachable (${reason})` };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Whether an address carries contract code on the chain behind `rpcUrl`.
 *
 * This is the check `VaultCodeService` uses to spot a restarted fork, applied to
 * the vault factory: the deploy output and the database survive a fork restart,
 * the contracts do not. An RPC failure is reported as a failure and never as
 * "no code" — a hiccup must not trigger a redeploy.
 */
export async function hasContractCode(rpcUrl, address, options) {
  const call = await rpcCall(rpcUrl, 'eth_getCode', [address, 'latest'], options);
  if (!call.ok) return call;
  const code = String(call.result);
  return { ok: true, hasCode: code !== '0x' && code !== '0x0' };
}

/** Whether any chain node answers at `rpcUrl`. */
export async function isForkReachable(rpcUrl, options) {
  const call = await rpcCall(rpcUrl, 'eth_chainId', [], options);
  return call.ok && typeof call.result === 'string';
}

/**
 * Whether an RPC endpoint can serve historical state — what forking BSC needs.
 * Public endpoints answer `eth_chainId` happily and then fail the fork with
 * "missing trie node", so the probe asks for a balance at a block that is old
 * enough to have been pruned away on a non-archive node.
 */
export async function probeArchiveRpc(rpcUrl, { blocksBack = 200_000, timeoutMs = 8000 } = {}) {
  const head = await rpcCall(rpcUrl, 'eth_blockNumber', [], { timeoutMs });
  if (!head.ok) return { status: 'unreachable', detail: head.error };

  const headNumber = Number.parseInt(String(head.result), 16);
  if (!Number.isFinite(headNumber)) {
    return { status: 'unreachable', detail: `${rpcUrl} returned an unreadable block number` };
  }
  const historicBlock = Math.max(1, headNumber - blocksBack);
  const probe = await rpcCall(
    rpcUrl,
    'eth_getBalance',
    ['0x0000000000000000000000000000000000000001', `0x${historicBlock.toString(16)}`],
    { timeoutMs },
  );
  if (probe.ok) return { status: 'archive', detail: `historical state at block ${historicBlock} is served` };
  return {
    status: 'not-archive',
    detail: `state at block ${historicBlock} is not available (${probe.error})`,
  };
}
