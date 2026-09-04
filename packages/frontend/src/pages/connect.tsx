import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useConnect, useAccount, useSwitchChain } from 'wagmi';
import { Navigate } from 'react-router';
import { KeyRound, ShieldCheck, Wallet } from 'lucide-react';
import { PublicShell } from '@/components/public-shell';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/providers/auth-context';
import { authErrorText } from '@/lib/auth-error';
import { config } from '@/lib/wagmi';

const targetChainId = config.chains[0].id;

export function ConnectPage() {
  const { t } = useTranslation();
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

  const errorMessage =
    authErrorText(t, authError) ?? getConnectErrorMessage(t, connectError);

  return (
    <PublicShell
      variant="entry"
      band={
        <p className="mt-3 text-sm text-on-band-sub">{t('connect.bandText')}</p>
      }
    >
      <h1 className="text-lg font-semibold tracking-tight">
        {t('connect.heading')}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('connect.intro')}</p>

      <div className="mt-6">
        {!hasMetaMask ? (
          <div className="py-6 text-center">
            <p className="text-sm font-medium">{t('connect.noWalletTitle')}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('connect.noWalletBody')}
            </p>
            <Button asChild className="mt-4">
              <a
                href="https://metamask.io/download/"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('connect.installMetaMask')}
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
              {isPending || isLoading
                ? t('connect.connecting')
                : t('connect.connectWallet')}
            </Button>
            {(isPending || isLoading) && (
              <p className="mt-3 text-center text-sm text-muted-foreground">
                {t('connect.pendingHint')}
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

      {/* items-start keeps the icon on the first line: the German promises are
          the ones that run to two. */}
      <ul className="mt-10 space-y-4 border-t border-border pt-6 text-sm text-secondary-foreground">
        <li className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          {t('connect.trustCustody')}
        </li>
        <li className="flex items-start gap-3">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          {t('connect.trustSignature')}
        </li>
      </ul>
    </PublicShell>
  );
}

/**
 * The three connect failures a visitor can act on. Anything else the connector
 * reports is a generic failure — a raw wallet message would not tell them what
 * to do next.
 */
function getConnectErrorMessage(t: TFunction, error: Error | null): string | null {
  if (!error) return null;
  if (error.message.includes('User rejected the request'))
    return t('connect.errorRejected');
  if (
    error.message.includes('popup') ||
    error.message.includes('already pending')
  )
    return t('connect.errorPopup');
  return t('connect.errorGeneric');
}
