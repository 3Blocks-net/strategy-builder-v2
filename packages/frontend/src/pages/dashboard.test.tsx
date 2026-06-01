import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardPage } from './dashboard';

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
}));

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '@/lib/api';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DashboardPage', () => {
  it('displays truncated wallet address', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ vaults: [] }),
    } as Response);

    render(<DashboardPage />);
    expect(screen.getByText('0xf39F...2266')).toBeInTheDocument();
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
    vi.mocked(apiFetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          vaults: [
            {
              address: '0x1234567890123456789012345678901234567890',
              label: 'My Vault',
              depositToken: '0xBUSD000000000000000000000000000000000000',
              chainId: 56,
              totalValueUsd: 1234.56,
              createdAt: '2026-05-01T00:00:00Z',
            },
          ],
        }),
    } as Response);

    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByText('My Vault')).toBeInTheDocument();
      expect(screen.getByText('$1,234.56')).toBeInTheDocument();
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
