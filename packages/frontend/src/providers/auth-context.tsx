import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { useAccount, useSignMessage, useDisconnect } from 'wagmi';
import { SiweMessage } from 'siwe';
import { useNavigate } from 'react-router';
import { fetchNonce, verifySignature, setOnAuthFailure } from '@/lib/api';

interface AuthState {
  isAuthenticated: boolean;
  address: string | null;
  isLoading: boolean;
  error: string | null;
  login: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { address: walletAddress, chainId, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { disconnect } = useDisconnect();
  const navigate = useNavigate();

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    const storedAddress = localStorage.getItem('walletAddress');
    if (token && storedAddress) {
      setIsAuthenticated(true);
      setAddress(storedAddress);
    }
    setIsLoading(false);
  }, []);

  const clearAuth = useCallback(() => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('walletAddress');
    setIsAuthenticated(false);
    setAddress(null);
  }, []);

  useEffect(() => {
    setOnAuthFailure(() => {
      clearAuth();
      navigate('/connect');
    });
  }, [clearAuth, navigate]);

  const login = useCallback(async () => {
    if (!walletAddress || !isConnected) return;
    setError(null);
    setIsLoading(true);

    try {
      const nonce = await fetchNonce();

      const message = new SiweMessage({
        domain: window.location.host,
        address: walletAddress,
        statement: 'Sign in to Pecunity',
        uri: window.location.origin,
        version: '1',
        chainId: chainId ?? 56,
        nonce,
        issuedAt: new Date().toISOString(),
      });

      const messageString = message.prepareMessage();
      const signature = await signMessageAsync({ message: messageString });

      const { accessToken, refreshToken } = await verifySignature(
        messageString,
        signature,
      );

      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('walletAddress', walletAddress);

      setIsAuthenticated(true);
      setAddress(walletAddress);
      navigate('/dashboard');
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : 'Authentication failed';
      if (msg.includes('User rejected'))
        setError('Signature rejected. Please try again.');
      else setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress, isConnected, chainId, signMessageAsync, navigate]);

  const logout = useCallback(() => {
    clearAuth();
    disconnect();
    navigate('/connect');
  }, [clearAuth, disconnect, navigate]);

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, address, isLoading, error, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}
