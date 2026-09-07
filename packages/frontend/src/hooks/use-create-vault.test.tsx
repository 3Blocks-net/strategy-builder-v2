import type { ReactNode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodePacked, keccak256, type Address } from 'viem';
import { useCreateVault } from './use-create-vault';
import {
  DeploymentConfigProvider,
  useDeploymentConfig,
} from '@/providers/deployment-config';

const writeContractAsync = vi.fn();

vi.mock('wagmi', () => ({
  useWriteContract: () => ({ writeContractAsync }),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn().mockResolvedValue({ ok: true, status: 201 }),
  fetchDeploymentConfig: vi.fn(),
}));

vi.mock('@/lib/wait-for-receipt', () => ({
  waitForReceipt: vi.fn(),
}));

import { fetchDeploymentConfig } from '@/lib/api';
import { waitForReceipt } from '@/lib/wait-for-receipt';

/** The address the running backend reports — deliberately not a build-time value. */
const BACKEND_FACTORY = '0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa';
const USER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Address;
const TOKEN = '0x55d398326f99059fF775485246999027B3197955' as Address;
const NEW_VAULT = '0xbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbB';

const CONFIG = {
  chainId: 31337,
  chainIdProblem: null,
  factoryAddress: BACKEND_FACTORY,
  feeRegistryAddress: '0x2222222222222222222222222222222222222222',
  pancakeFactoryAddress: '0x3333333333333333333333333333333333333333',
};

function vaultCreatedReceipt() {
  const topic = keccak256(
    encodePacked(['string'], ['VaultCreated(address,address,uint256)']),
  );
  return {
    blockNumber: 42n,
    logs: [
      {
        topics: [topic, `0x${'0'.repeat(24)}${NEW_VAULT.slice(2)}`],
      },
    ],
  };
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <DeploymentConfigProvider>{children}</DeploymentConfigProvider>
);

/** Renders the hook alongside the config status, so a test can wait for it. */
function renderCreateVault() {
  return renderHook(
    () => ({ create: useCreateVault(), deployment: useDeploymentConfig() }),
    { wrapper },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  writeContractAsync.mockResolvedValue('0xdeadbeef');
  vi.mocked(waitForReceipt).mockResolvedValue(
    vaultCreatedReceipt() as unknown as Awaited<ReturnType<typeof waitForReceipt>>,
  );
});

afterEach(() => {
  cleanup();
});

describe('creating a vault', () => {
  it('sends the transaction to the factory the backend named', async () => {
    vi.mocked(fetchDeploymentConfig).mockResolvedValue(CONFIG);

    const { result } = renderCreateVault();
    await waitFor(() => expect(result.current.deployment.status).toBe('ready'));

    await act(async () => {
      await result.current.create.createVault(
        { depositToken: TOKEN, chainId: 31337 },
        USER,
      );
    });

    expect(writeContractAsync).toHaveBeenCalledWith(
      expect.objectContaining({ address: BACKEND_FACTORY }),
    );
    expect(result.current.create.step).toBe('done');
  });

  it('picks up a new factory after a redeploy without a rebuild', async () => {
    const REDEPLOYED = '0xcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcC';
    vi.mocked(fetchDeploymentConfig)
      .mockResolvedValueOnce(CONFIG)
      .mockResolvedValueOnce({ ...CONFIG, factoryAddress: REDEPLOYED });

    const { result } = renderCreateVault();
    await waitFor(() => expect(result.current.deployment.status).toBe('ready'));

    // Standing in for the page reload after `pnpm contracts:deploy:fork`.
    act(() => result.current.deployment.reload());
    await waitFor(() =>
      expect(result.current.deployment.config?.factoryAddress).toBe(REDEPLOYED),
    );

    await act(async () => {
      await result.current.create.createVault(
        { depositToken: TOKEN, chainId: 31337 },
        USER,
      );
    });

    expect(writeContractAsync).toHaveBeenCalledWith(
      expect.objectContaining({ address: REDEPLOYED }),
    );
  });

  it('sends nothing while the address is unknown', async () => {
    vi.mocked(fetchDeploymentConfig).mockRejectedValue(new Error('offline'));

    const { result } = renderCreateVault();
    await waitFor(() =>
      expect(result.current.deployment.status).toBe('unavailable'),
    );

    await act(async () => {
      await result.current.create.createVault(
        { depositToken: TOKEN, chainId: 31337 },
        USER,
      );
    });

    expect(writeContractAsync).not.toHaveBeenCalled();
    expect(result.current.create.step).toBe('error');
    expect(result.current.create.errorCode).toBe('factory-missing');
  });
});
