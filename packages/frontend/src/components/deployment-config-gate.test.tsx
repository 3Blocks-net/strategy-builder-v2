import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { DeploymentConfigGate } from './deployment-config-gate';
import { DeploymentConfigProvider } from '@/providers/deployment-config';
import { setLanguage } from '@/i18n';

vi.mock('@/lib/api', () => ({
  fetchDeploymentConfig: vi.fn(),
}));

vi.mock('@/providers/auth-context', () => ({
  useAuth: () => ({
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    logout: vi.fn(),
  }),
}));

import { fetchDeploymentConfig } from '@/lib/api';

const CONFIG = {
  chainId: 31337,
  chainIdProblem: null,
  factoryAddress: '0x1111111111111111111111111111111111111111',
  feeRegistryAddress: '0x2222222222222222222222222222222222222222',
  pancakeFactoryAddress: '0x3333333333333333333333333333333333333333',
};

function renderGate() {
  return render(
    <MemoryRouter>
      <DeploymentConfigProvider>
        <DeploymentConfigGate>
          <p>Create a Vault</p>
        </DeploymentConfigGate>
      </DeploymentConfigProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  cleanup();
  await setLanguage('en');
});

describe('the screen behind the deployment config', () => {
  it('stays hidden until the addresses have arrived', async () => {
    let answer: (value: typeof CONFIG) => void = () => {};
    vi.mocked(fetchDeploymentConfig).mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );

    renderGate();

    // While the answer is outstanding nothing is offered that could act on an
    // address we do not have yet.
    expect(screen.queryByText('Create a Vault')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(screen.getByText('Getting ready')).toBeInTheDocument();

    answer(CONFIG);

    expect(await screen.findByText('Create a Vault')).toBeInTheDocument();
  });

  it('asks the backend once, however many screens read the answer', async () => {
    vi.mocked(fetchDeploymentConfig).mockResolvedValue(CONFIG);

    render(
      <MemoryRouter>
        <DeploymentConfigProvider>
          <DeploymentConfigGate>
            <p>First reader</p>
          </DeploymentConfigGate>
          <DeploymentConfigGate>
            <p>Second reader</p>
          </DeploymentConfigGate>
        </DeploymentConfigProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('First reader')).toBeInTheDocument();
    expect(screen.getByText('Second reader')).toBeInTheDocument();
    expect(fetchDeploymentConfig).toHaveBeenCalledTimes(1);
  });
});

describe('when the backend does not answer', () => {
  it('says so, and passes the backend’s own explanation through', async () => {
    vi.mocked(fetchDeploymentConfig).mockRejectedValue(
      new Error('No deploy output at deployments/fork-latest.json.'),
    );

    renderGate();

    expect(await screen.findByText('Backend not reachable')).toBeInTheDocument();
    expect(screen.queryByText('Create a Vault')).not.toBeInTheDocument();
    expect(
      screen.getByText(/No deploy output at deployments\/fork-latest\.json\./),
    ).toBeInTheDocument();
  });

  /**
   * The case the screen is named after: nothing is listening on the API port.
   * The detail line has to carry a sentence a reader can act on — not the empty
   * space it showed while only "answered, but refusing" was handled.
   */
  it('says which backend did not answer when nothing is listening', async () => {
    vi.mocked(fetchDeploymentConfig).mockRejectedValue(
      new Error(
        'The backend at http://localhost:3001 did not answer (Failed to fetch). Is it running? `pnpm dev` starts it.',
      ),
    );

    renderGate();

    expect(await screen.findByText('Backend not reachable')).toBeInTheDocument();
    expect(screen.getByText(/http:\/\/localhost:3001/)).toBeInTheDocument();
    expect(screen.getByText(/pnpm dev/)).toBeInTheDocument();
  });

  it('offers a retry that actually asks again', async () => {
    vi.mocked(fetchDeploymentConfig)
      .mockRejectedValueOnce(new Error('Connection refused.'))
      .mockResolvedValueOnce(CONFIG);

    renderGate();

    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Create a Vault')).toBeInTheDocument();
    expect(fetchDeploymentConfig).toHaveBeenCalledTimes(2);
  });

  it('offers a way on when retrying is not what the reader wants', async () => {
    vi.mocked(fetchDeploymentConfig).mockRejectedValue(new Error('nope'));

    renderGate();

    const back = await screen.findByRole('link', { name: 'Back to the dashboard' });
    expect(back).toHaveAttribute('href', '/dashboard');
  });

  it('speaks German when the reader does', async () => {
    vi.mocked(fetchDeploymentConfig).mockRejectedValue(new Error('nope'));
    await setLanguage('de');

    renderGate();

    expect(await screen.findByText('Backend nicht erreichbar')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: 'Zurück zum Dashboard' }),
      ).toBeInTheDocument(),
    );
  });
});
