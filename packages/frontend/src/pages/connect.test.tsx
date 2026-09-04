import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConnectPage } from './connect';
import { setLanguage } from '@/i18n';
import type { AuthFailure } from '@/lib/auth-error';

const mockLogin = vi.fn();
const mockNavigate = vi.fn();
let mockAuthError: AuthFailure | null = null;

vi.mock('wagmi', () => ({
  useConnect: () => ({
    connect: vi.fn(),
    connectors: [{ id: 'injected', name: 'Injected', type: 'injected' }],
    error: null,
    isPending: false,
  }),
  useAccount: () => ({ isConnected: false }),
  useSwitchChain: () => ({ switchChain: vi.fn() }),
}));

vi.mock('@/lib/wagmi', () => ({
  config: { chains: [{ id: 56 }] },
}));

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    Navigate: ({ to }: { to: string }) => <div data-testid={`navigate-${to}`} />,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/providers/auth-context', () => ({
  useAuth: () => ({
    isAuthenticated: false,
    login: mockLogin,
    error: mockAuthError,
    isLoading: false,
  }),
}));

/** Clicking a language reloads the catalog — let React settle before asserting. */
async function chooseLanguage(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
}

describe('ConnectPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    cleanup();
    mockAuthError = null;
    window.localStorage.clear();
    await setLanguage('en');
  });

  it('renders connect wallet button when MetaMask is available', () => {
    Object.defineProperty(window, 'ethereum', { value: {}, writable: true });
    render(<ConnectPage />);
    expect(
      screen.getByRole('button', { name: /connect wallet/i }),
    ).toBeInTheDocument();
  });

  it('shows install MetaMask message when not available', () => {
    Object.defineProperty(window, 'ethereum', {
      value: undefined,
      writable: true,
    });
    render(<ConnectPage />);
    expect(screen.getByText(/metamask is not installed/i)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /install metamask/i }),
    ).toBeInTheDocument();
  });
});

describe('ConnectPage in German', () => {
  afterEach(async () => {
    cleanup();
    mockAuthError = null;
    window.localStorage.clear();
    await setLanguage('en');
  });

  it('translates the door itself', async () => {
    Object.defineProperty(window, 'ethereum', { value: {}, writable: true });
    render(<ConnectPage />);

    await chooseLanguage('Deutsch');

    expect(
      screen.getByRole('heading', { level: 1, name: 'Anmelden' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /wallet verbinden/i }),
    ).toBeInTheDocument();
  });

  it('translates the missing-wallet state, which keeps its way out', async () => {
    Object.defineProperty(window, 'ethereum', {
      value: undefined,
      writable: true,
    });
    render(<ConnectPage />);

    await chooseLanguage('Deutsch');

    // MetaMask is a product name and stays as it is; the sentence around it does not.
    expect(
      screen.getByText('MetaMask ist nicht installiert.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'MetaMask installieren' }),
    ).toHaveAttribute('href', 'https://metamask.io/download/');
  });

  it('translates a rejected signature, the most common way this page fails', async () => {
    Object.defineProperty(window, 'ethereum', { value: {}, writable: true });
    mockAuthError = {
      code: 'signature-rejected',
      message: 'User rejected the request',
    };
    render(<ConnectPage />);

    await chooseLanguage('Deutsch');

    expect(
      screen.getByText('Signatur abgelehnt. Bitte versuche es erneut.'),
    ).toBeInTheDocument();
  });
});
