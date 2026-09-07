import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Loader2, ServerOff } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { useDeploymentConfig } from '@/providers/deployment-config';

/**
 * Stands in front of everything that needs a contract address (#31).
 *
 * Since the addresses come from the backend, the answer can be pending or
 * missing — and both are states a reader must be able to see. Guardrail 4 of
 * `docs/produkt.md`: a failure is a view of its own, not a greyed-out button
 * that silently does nothing. So while the answer is pending nothing is
 * rendered that could promise an action, and when it does not arrive the
 * screen says so and offers a way on.
 */
export function DeploymentConfigGate({ children }: { children: ReactNode }) {
  const { status, reason, reload } = useDeploymentConfig();
  const { t } = useTranslation();

  if (status === 'ready') return <>{children}</>;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-md text-center">
        {status === 'loading' ? (
          <>
            <Loader2
              className="mx-auto h-6 w-6 animate-spin text-muted-foreground"
              aria-hidden
            />
            <h1 className="mt-4 text-lg font-semibold tracking-tight">
              {t('deploymentConfig.loading.heading')}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('deploymentConfig.loading.body')}
            </p>
          </>
        ) : (
          <>
            <ServerOff
              className="mx-auto h-6 w-6 text-destructive"
              aria-hidden
            />
            <h1 className="mt-4 text-lg font-semibold tracking-tight">
              {t('deploymentConfig.unavailable.heading')}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('deploymentConfig.unavailable.body')}
            </p>
            {reason && (
              <p className="mt-4 rounded-md bg-muted px-3 py-2 text-left text-xs break-words text-muted-foreground">
                {t('deploymentConfig.unavailable.detail', { reason })}
              </p>
            )}
            <div className="mt-6 flex justify-center gap-2">
              <Button onClick={reload}>{t('common.retry')}</Button>
              <Button variant="outline" asChild>
                <Link to="/dashboard">
                  {t('deploymentConfig.unavailable.backToDashboard')}
                </Link>
              </Button>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
