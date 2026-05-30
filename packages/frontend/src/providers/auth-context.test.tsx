import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthProvider, useAuth } from './auth-context';

const mockNavigate = vi.fn();
const mockDisconnect = vi.fn();
const mockSignMessageAsync = vi.fn();

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('wagmi', () => ({
  useAccount: () => ({
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    chainId: 56,
    isConnected: true,
  }),
  useSignMessage: () => ({ signMessageAsync: mockSignMessageAsync }),
  useDisconnect: () => ({ disconnect: mockDisconnect }),
}));

function TestConsumer() {
  const { isAuthenticated, address, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="auth">{String(isAuthenticated)}</span>
      <span data-testid="address">{address ?? 'none'}</span>
      <button onClick={login}>Login</button>
      <button onClick={logout}>Logout</button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <AuthProvider>
      <TestConsumer />
    </AuthProvider>,
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    globalThis.fetch = vi.fn();
  });

  it('restores auth state from localStorage on mount', () => {
    localStorage.setItem('accessToken', 'tok');
    localStorage.setItem('walletAddress', '0xabc');

    renderWithProvider();

    expect(screen.getByTestId('auth').textContent).toBe('true');
    expect(screen.getByTestId('address').textContent).toBe('0xabc');
  });

  it('login stores tokens and sets authenticated state', async () => {
    (globalThis.fetch as any)
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ nonce: 'testnonce1234567890' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            accessToken: 'access123',
            refreshToken: 'refresh123',
          }),
      });
    mockSignMessageAsync.mockResolvedValueOnce('0xsig');

    renderWithProvider();

    await act(async () => {
      screen.getByRole('button', { name: /login/i }).click();
    });

    expect(localStorage.getItem('accessToken')).toBe('access123');
    expect(localStorage.getItem('refreshToken')).toBe('refresh123');
    expect(screen.getByTestId('auth').textContent).toBe('true');
  });

  it('logout clears tokens and disconnects', async () => {
    localStorage.setItem('accessToken', 'tok');
    localStorage.setItem('refreshToken', 'ref');
    localStorage.setItem('walletAddress', '0xabc');

    renderWithProvider();

    await act(async () => {
      screen.getByRole('button', { name: /logout/i }).click();
    });

    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(mockDisconnect).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/connect');
  });
});
