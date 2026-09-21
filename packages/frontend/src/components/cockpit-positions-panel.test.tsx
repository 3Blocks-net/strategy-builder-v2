import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CockpitPositionsPanel } from './cockpit-positions-panel';
import { VaultPositionsProvider } from '@/hooks/use-vault-positions';
import { setLanguage } from '@/i18n';

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }));

import { apiFetch } from '@/lib/api';

const VAULT = '0x1234567890123456789012345678901234567890';

const answer = (body: unknown) =>
  vi.mocked(apiFetch).mockResolvedValue({
    ok: true,
    json: async () => body,
  } as Response);

const view = (over: Record<string, unknown> = {}) => ({
  vaultAddress: VAULT,
  positions: [],
  totalValueUsd: 0,
  asOfBlock: null,
  asOf: new Date().toISOString(),
  source: 'live',
  ...over,
});

const panel = () => (
  <VaultPositionsProvider address={VAULT}>
    <CockpitPositionsPanel />
  </VaultPositionsProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  cleanup();
  await setLanguage('en');
});

describe('the cockpit positions panel', () => {
  it('shows the vault as protected when the cockpit answer says so', async () => {
    answer(
      view({
        protection: { status: 'standard', checkedAt: new Date().toISOString() },
      }),
    );

    render(panel());

    expect(await screen.findByText('Protected')).toBeInTheDocument();
  });

  it('shows expert mode, and never "protected", for an opted-out vault', async () => {
    answer(
      view({
        protection: { status: 'expert', checkedAt: new Date().toISOString() },
      }),
    );

    render(panel());

    expect(await screen.findByText('Expert mode')).toBeInTheDocument();
    expect(screen.queryByText('Protected')).not.toBeInTheDocument();
  });

  it('claims no protection when the answer carries no status', async () => {
    answer(view());

    render(panel());

    expect(
      await screen.findByText(/protection status unknown/i),
    ).toBeInTheDocument();
    expect(screen.queryByText('Protected')).not.toBeInTheDocument();
  });

  it('claims no protection when the positions request fails', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('offline'));

    render(panel());

    await waitFor(() =>
      expect(screen.getByText(/failed to load positions/i)).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/protection status unknown/i),
    ).toBeInTheDocument();
    expect(screen.queryByText('Protected')).not.toBeInTheDocument();
  });

  it('drops a protection claim as soon as a refresh of it fails', async () => {
    // The first answer said "protected". The refresh never arrived, so that
    // answer is no longer evidence of anything — and a confident badge next
    // to "could not be loaded" is precisely the contradiction to avoid.
    answer(
      view({
        protection: { status: 'standard', checkedAt: new Date().toISOString() },
      }),
    );

    render(panel());
    expect(await screen.findByText('Protected')).toBeInTheDocument();

    vi.mocked(apiFetch).mockRejectedValue(new Error('offline'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    });

    await waitFor(() =>
      expect(screen.getByText(/failed to load positions/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText('Protected')).not.toBeInTheDocument();
    expect(screen.getByText(/protection status unknown/i)).toBeInTheDocument();
  });

  it('states nothing about protection while the answer is still outstanding', () => {
    vi.mocked(apiFetch).mockReturnValue(new Promise(() => {}) as Promise<Response>);

    render(panel());

    expect(screen.queryByText('Protected')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/protection status unknown/i),
    ).not.toBeInTheDocument();
  });
});
