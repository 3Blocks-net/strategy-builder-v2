import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEPLOYMENT_CONFIG_TIMEOUT_MS,
  fetchDeploymentConfig,
} from './api';

const CONFIG = {
  chainId: 31337,
  chainIdProblem: null,
  factoryAddress: '0x1111111111111111111111111111111111111111',
  feeRegistryAddress: '0x2222222222222222222222222222222222222222',
  pancakeFactoryAddress: '0x3333333333333333333333333333333333333333',
};

function respondWith(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return vi.fn(async () => ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('asking the backend for the deployment configuration', () => {
  it('returns what the backend answered', async () => {
    vi.stubGlobal('fetch', respondWith(CONFIG));

    await expect(fetchDeploymentConfig()).resolves.toEqual(CONFIG);
  });

  it('passes a refusal through with the backend’s own wording', async () => {
    vi.stubGlobal(
      'fetch',
      respondWith(
        { message: 'FACTORY_ADDRESS is not set. Run `pnpm contracts:deploy:fork`.' },
        { ok: false, status: 503 },
      ),
    );

    await expect(fetchDeploymentConfig()).rejects.toThrow(
      /pnpm contracts:deploy:fork/,
    );
  });

  /**
   * The everyday case behind "backend not reachable": nothing is listening, and
   * the browser rejects with a bare "Failed to fetch". On its own that is not
   * something a reader can act on, so the message says where and what to do.
   */
  it('says which backend did not answer when the connection is refused', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    await expect(fetchDeploymentConfig()).rejects.toThrow(
      /did not answer .*Failed to fetch.*pnpm dev/s,
    );
  });

  /**
   * A backend that accepts the connection and then never answers used to leave
   * the screen loading for good.
   */
  it('gives up instead of waiting forever', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          }),
      ),
    );

    const pending = fetchDeploymentConfig();
    const assertion = expect(pending).rejects.toThrow(/did not answer within 8 seconds/);
    await vi.advanceTimersByTimeAsync(DEPLOYMENT_CONFIG_TIMEOUT_MS + 1);

    await assertion;
  });
});
