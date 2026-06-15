import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConnectPage } from './connect';

const mockLogin = vi.fn();
const mockNavigate = vi.fn();

vi.mock('wagmi', () => ({
  useConnect: () => ({
    connect: vi.fn(),
    connectors: [{ id: 'injected', name: 'Injected', type: 'injected' }],
    error: null,
    isPending: false,
  }),
  useAccount: () => ({ isConnected: false }),
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
    error: null,
    isLoading: false,
  }),
}));

describe('ConnectPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
