import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ExecutionHistoryTable } from './execution-history-table';
import { LanguageSwitcher } from './language-switcher';
import { setLanguage } from '@/i18n';

const VAULT = '0x1234567890123456789012345678901234567890';

vi.mock('@/hooks/use-executions-socket', () => ({
  useExecutionsSocket: () => ({ connected: true }),
}));

vi.mock('@/hooks/use-indexer-status', () => ({
  useIndexerStatus: () => null,
}));

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '@/lib/api';

/** The table is always on a page that carries the switcher — so is this test. */
function renderTable() {
  return render(
    <>
      <LanguageSwitcher />
      <ExecutionHistoryTable vaultAddress={VAULT} />
    </>,
  );
}

async function chooseLanguage(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  cleanup();
  window.localStorage.clear();
  await setLanguage('en');
});

describe('ExecutionHistoryTable', () => {
  it('translates the empty state, which stays a full view', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ rows: [], total: 0 }),
    } as Response);

    renderTable();
    await waitFor(() => {
      expect(screen.getByText('No activity yet.')).toBeInTheDocument();
    });
    expect(
      screen.getByRole('heading', { name: 'Execution History' }),
    ).toBeInTheDocument();

    await chooseLanguage('Deutsch');

    expect(screen.getByText('Noch keine Aktivität.')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Ausführungs-Historie' }),
    ).toBeInTheDocument();
  });

  it('translates the error state including its way out', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}),
    } as Response);

    renderTable();
    await waitFor(() => {
      expect(
        screen.getByText('Failed to load execution history'),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();

    await chooseLanguage('Deutsch');

    expect(
      screen.getByText('Ausführungs-Historie konnte nicht geladen werden'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Erneut versuchen' }),
    ).toBeInTheDocument();
  });

  it('keeps the finance terms English in the German table', async () => {
    vi.mocked(apiFetch).mockImplementation((path: string) => {
      if (path.startsWith('/tokens/accepted')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              { address: '0xaaa', symbol: 'USDT', decimals: 18 },
            ]),
        } as Response);
      }
      if (path.includes('/executions')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              rows: [
                {
                  kind: 'vault_event',
                  id: 'e1',
                  txHash: null,
                  blockNumber: 1,
                  logIndex: 0,
                  blockTimestamp: '2026-05-15T12:00:00Z',
                  automationId: null,
                  gasCompAmount: null,
                  gasCompToken: null,
                  gasCompUsd: null,
                  eventType: 'DEPOSIT',
                  token: '0xaaa',
                  amount: '1000000000000000000',
                  amountUsd: '1',
                  feeAmount: null,
                  feeBps: null,
                  failureStatus: null,
                  errorMessage: null,
                  attemptCount: null,
                },
              ],
              total: 1,
            }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response);
    });

    renderTable();
    await waitFor(() => {
      expect(screen.getByText('Deposit')).toBeInTheDocument();
    });

    await chooseLanguage('Deutsch');

    // The row badge is a finance term and stays English …
    expect(screen.getByText('Deposit')).toBeInTheDocument();
    // … while the column headings around it are German.
    expect(
      screen.getByRole('columnheader', { name: 'Datum' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Kosten' }),
    ).toBeInTheDocument();
  });
});
