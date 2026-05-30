import { useEffect } from 'react';
import { useConnect, useAccount } from 'wagmi';
import { Navigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/providers/auth-context';

export function ConnectPage() {
  const { connect, connectors, error: connectError, isPending } = useConnect();
  const { isConnected } = useAccount();
  const { isAuthenticated, login, error: authError, isLoading } = useAuth();

  const injectedConnector = connectors.find((c) => c.type === 'injected');
  const hasMetaMask =
    typeof window !== 'undefined' && typeof window.ethereum !== 'undefined';

  useEffect(() => {
    if (isConnected && !isAuthenticated && !isLoading) {
      login();
    }
  }, [isConnected, isAuthenticated, isLoading, login]);

  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  const errorMessage =
    authError ?? getConnectErrorMessage(connectError);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="mx-auto w-full max-w-sm space-y-6 text-center">
        <h1 className="text-3xl font-bold">Pecunity</h1>
        <p className="text-muted-foreground">
          Connect your wallet to get started.
        </p>

        {!hasMetaMask ? (
          <div className="space-y-3">
            <p className="text-sm text-destructive">
              MetaMask is not installed.
            </p>
            <Button asChild>
              <a
                href="https://metamask.io/download/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Install MetaMask
              </a>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Button
              size="lg"
              className="w-full"
              disabled={isPending || isLoading}
              onClick={() =>
                injectedConnector && connect({ connector: injectedConnector })
              }
            >
              {isPending || isLoading ? 'Connecting...' : 'Connect Wallet'}
            </Button>

            {errorMessage && (
              <p className="text-sm text-destructive">{errorMessage}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function getConnectErrorMessage(error: Error | null): string | null {
  if (!error) return null;
  if (error.message.includes('User rejected the request'))
    return 'Connection rejected. Please try again.';
  if (
    error.message.includes('popup') ||
    error.message.includes('already pending')
  )
    return 'Please allow the MetaMask popup and try again.';
  return 'Connection failed. Please try again.';
}
