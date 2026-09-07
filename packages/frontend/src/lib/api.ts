const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

let onTokenExpiredAndRefreshFailed: (() => void) | null = null;

export function setOnAuthFailure(cb: () => void) {
  onTokenExpiredAndRefreshFailed = cb;
}

export async function apiFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const accessToken = localStorage.getItem('accessToken');
  const headers = new Headers(init?.headers);
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }
  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json');
  }

  let res = await fetch(`${API_URL}${path}`, { ...init, headers });

  if (res.status === 401) {
    const body = await res.json().catch(() => ({}));
    if (body.message === 'TOKEN_EXPIRED') {
      const refreshed = await silentRefresh();
      if (refreshed) {
        headers.set(
          'Authorization',
          `Bearer ${localStorage.getItem('accessToken')}`,
        );
        res = await fetch(`${API_URL}${path}`, { ...init, headers });
      } else {
        onTokenExpiredAndRefreshFailed?.();
      }
    }
  }

  return res;
}

async function silentRefresh(): Promise<boolean> {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) return false;

    const { accessToken } = await res.json();
    localStorage.setItem('accessToken', accessToken);
    return true;
  } catch {
    return false;
  }
}

export async function fetchNonce(): Promise<string> {
  const res = await fetch(`${API_URL}/auth/nonce`);
  const { nonce } = await res.json();
  return nonce;
}

export async function verifySignature(
  message: string,
  signature: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await fetch(`${API_URL}/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, signature }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? 'Verification failed');
  }

  return res.json();
}

/** Chain and contract addresses the backend is deployed against (`GET /config`). */
export interface DeploymentConfig {
  /** `null` when the backend could not reach the chain — never a guess. */
  chainId: number | null;
  /** Why the chain id is missing; `null` when it is not. */
  chainIdProblem: string | null;
  factoryAddress: string;
  feeRegistryAddress: string;
  pancakeFactoryAddress: string;
}

/** How long we wait for the answer before calling the backend unreachable. */
export const DEPLOYMENT_CONFIG_TIMEOUT_MS = 8000;

/**
 * Asks the backend which contracts it works against, instead of baking the
 * addresses into the bundle at build time (#31).
 *
 * Deliberately not routed through `apiFetch`: the answer is needed before
 * anyone signs in, and these are public on-chain addresses, not secrets.
 *
 * Every way this can go wrong ends in an error message that says what happened:
 * a refusal carries the backend's own wording — it names what to run — and a
 * backend that is not running at all, or takes too long, says exactly that.
 * Without the timeout the caller would wait forever and the screen would stay
 * on "loading" instead of ever telling the reader anything.
 */
export async function fetchDeploymentConfig(): Promise<DeploymentConfig> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    DEPLOYMENT_CONFIG_TIMEOUT_MS,
  );

  let res: Response;
  try {
    res = await fetch(`${API_URL}/config`, { signal: controller.signal });
  } catch (err) {
    throw new Error(describeUnreachableBackend(err, controller.signal.aborted));
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      typeof body.message === 'string'
        ? body.message
        : `The backend answered with HTTP ${res.status}.`,
    );
  }
  return res.json();
}

/**
 * The case the browser reports as a bare "Failed to fetch": nothing answered.
 * The reader gets the address that was tried and the command that starts it,
 * because "load failed" on its own is not something anyone can act on.
 */
function describeUnreachableBackend(err: unknown, timedOut: boolean): string {
  if (timedOut) {
    return `The backend at ${API_URL} did not answer within ${Math.round(
      DEPLOYMENT_CONFIG_TIMEOUT_MS / 1000,
    )} seconds. It may still be starting up — is \`pnpm dev\` running?`;
  }
  const detail = err instanceof Error ? err.message : String(err);
  return `The backend at ${API_URL} did not answer (${detail}). Is it running? \`pnpm dev\` starts it.`;
}
