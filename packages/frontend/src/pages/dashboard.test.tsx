import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DashboardPage } from './dashboard';
import { setLanguage } from '@/i18n';

const TEST_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

const mockNavigate = vi.fn();

vi.mock('@/providers/auth-context', () => ({
  useAuth: () => ({
    address: TEST_ADDRESS,
    logout: vi.fn(),
  }),
}));

vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
  NavLink: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{typeof children === 'function' ? null : children}</a>
  ),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '@/lib/api';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  // Unmount before resetting the language: a switch on a mounted tree would
  // re-render outside of act().
  cleanup();
  window.localStorage.clear();
  await setLanguage('en');
});

const VAULT = {
  address: '0x1234567890123456789012345678901234567890',
  label: 'My Vault',
  depositToken: '0xBUSD000000000000000000000000000000000000',
  chainId: 56,
  totalValueUsd: 1234.56,
  createdAt: '2026-05-15T12:00:00Z',
};

function respondWith(vaults: (typeof VAULT)[]) {
  vi.mocked(apiFetch).mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ vaults }),
  } as Response);
}

/** Clicking a language reloads the catalog — let React settle before asserting. */
async function chooseLanguage(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
}

describe('DashboardPage', () => {
  it('displays truncated wallet address', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ vaults: [] }),
    } as Response);

    render(<DashboardPage />);
    expect(screen.getByText('0xf39F…2266')).toBeInTheDocument();
  });

  it('has a disconnect button', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ vaults: [] }),
    } as Response);

    render(<DashboardPage />);
    expect(
      screen.getByRole('button', { name: /disconnect/i }),
    ).toBeInTheDocument();
  });

  it('shows empty state when no vaults', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ vaults: [] }),
    } as Response);

    render(<DashboardPage />);
    await waitFor(() => {
      expect(
        screen.getByText(/don't have any vaults/i),
      ).toBeInTheDocument();
    });
  });

  it('shows vault table when vaults exist', async () => {
    respondWith([VAULT]);

    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByText('My Vault')).toBeInTheDocument();
      // Appears twice: aggregated portfolio value in the band + the vault row.
      expect(screen.getAllByText('$1,234.56')).toHaveLength(2);
    });
  });

  it('shows error state with retry on fetch failure', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}),
    } as Response);

    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /retry/i }),
      ).toBeInTheDocument();
    });
  });

  it('has a create vault button', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ vaults: [] }),
    } as Response);

    render(<DashboardPage />);
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /create vault/i }),
      ).toBeInTheDocument();
    });
  });
});

/**
 * The dashboard is the proof that the mechanism carries: copy, numbers and
 * dates all follow the chosen language, and nothing on it is pinned to
 * English.
 */
describe('DashboardPage in German', () => {
  it('switches copy, money notation and dates together', async () => {
    respondWith([VAULT]);
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Your Vaults')).toBeInTheDocument();
    });
    expect(screen.getAllByText('$1,234.56')).toHaveLength(2);
    expect(screen.getByText(/May 15, 2026/)).toBeInTheDocument();
    expect(screen.getByText('Across 1 vault · BSC')).toBeInTheDocument();

    await chooseLanguage('Deutsch');

    expect(screen.getByText('Deine Vaults')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Vault erstellen' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Portfolio-Wert')).toBeInTheDocument();
    expect(screen.getByText('Verteilt auf 1 Vault · BSC')).toBeInTheDocument();
    expect(screen.getAllByText(/1\.234,56/)).toHaveLength(2);
    expect(screen.getByText(/15\. Mai 2026/)).toBeInTheDocument();
  });

  it('counts vaults with the right plural form', async () => {
    respondWith([VAULT, { ...VAULT, address: '0xabc', label: 'Second Vault' }]);
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Across 2 vaults · BSC')).toBeInTheDocument();
    });

    await chooseLanguage('Deutsch');

    expect(screen.getByText('Verteilt auf 2 Vaults · BSC')).toBeInTheDocument();
  });

  it('translates the empty state', async () => {
    respondWith([]);
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('No vaults yet · BSC')).toBeInTheDocument();
    });

    await chooseLanguage('Deutsch');

    expect(screen.getByText('Du hast noch keine Vaults.')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Ersten Vault erstellen' }),
    ).toBeInTheDocument();
  });

  it('translates the error view, which keeps its explanation and retry', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}),
    } as Response);
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load your vaults')).toBeInTheDocument();
    });

    await chooseLanguage('Deutsch');

    expect(
      screen.getByText('Deine Vaults konnten nicht geladen werden'),
    ).toBeInTheDocument();
    expect(screen.getByText(/nicht bei uns/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Erneut versuchen' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Portfolio-Wert derzeit nicht verfügbar'),
    ).toBeInTheDocument();
  });
});
