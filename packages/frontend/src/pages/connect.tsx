import { useEffect } from 'react';
import { useConnect, useAccount, useSwitchChain } from 'wagmi';
import { Navigate } from 'react-router';
import { KeyRound, ShieldCheck, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/providers/auth-context';
import { config } from '@/lib/wagmi';

const targetChainId = config.chains[0].id;

export function ConnectPage() {
  const { connect, connectors, error: connectError, isPending } = useConnect();
  const { isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const { isAuthenticated, login, error: authError, isLoading } = useAuth();

  const injectedConnector = connectors.find((c) => c.type === 'injected');
  const hasMetaMask =
    typeof window !== 'undefined' && typeof window.ethereum !== 'undefined';

  useEffect(() => {
    if (isConnected && chainId !== targetChainId) {
      switchChain({ chainId: targetChainId });
    }
  }, [isConnected, chainId, switchChain]);

  useEffect(() => {
    if (isConnected && chainId === targetChainId && !isAuthenticated && !isLoading) {
      login();
    }
  }, [isConnected, chainId, isAuthenticated, isLoading, login]);

  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  const errorMessage = authError ?? getConnectErrorMessage(connectError);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="band bg-linear-to-b from-band to-band-deep">
        <div className="mx-auto max-w-md px-6 py-12 text-center">
          <p className="font-wordmark text-3xl font-semibold tracking-tight text-on-band">
            pecunity
          </p>
          <p className="mt-3 text-sm text-on-band-sub">
            Your DeFi strategies in one place — self-custodied, protected by
            default, running on their own.
          </p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-md flex-1 px-6 py-10">
        <h1 className="text-lg font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Signing in is a free wallet signature. It grants no allowance and
          gives no one access to your funds.
        </p>

        <div className="mt-6">
          {!hasMetaMask ? (
            <div className="py-6 text-center">
              <p className="text-sm font-medium">MetaMask is not installed.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                You need a wallet to use Pecunity.
              </p>
              <Button asChild className="mt-4">
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
            <div>
              <Button
                size="lg"
                className="w-full"
                disabled={isPending || isLoading}
                onClick={() =>
                  injectedConnector && connect({ connector: injectedConnector })
                }
              >
                <Wallet className="h-4 w-4" aria-hidden />
                {isPending || isLoading ? 'Connecting…' : 'Connect Wallet'}
              </Button>
              {(isPending || isLoading) && (
                <p className="mt-3 text-center text-sm text-muted-foreground">
                  Check your wallet — confirm the connection, then sign the
                  sign-in message.
                </p>
              )}
              {errorMessage && (
                <p className="mt-3 text-center text-sm text-destructive">
                  {errorMessage}
                </p>
              )}
            </div>
          )}
        </div>

        <ul className="mt-10 space-y-4 border-t border-border pt-6 text-sm text-secondary-foreground">
          <li className="flex gap-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            Your funds stay in a vault contract only you control — we never
            hold them.
          </li>
          <li className="flex gap-3">
            <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            Every action that moves funds needs your explicit signature, one by
            one.
          </li>
        </ul>
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
