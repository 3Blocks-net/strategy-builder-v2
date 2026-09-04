import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';
import { Check, Copy, LogOut } from 'lucide-react';
import { BrandLogo } from '@/components/brand-logo';
import { LanguageSwitcher } from '@/components/language-switcher';
import { useAuth } from '@/providers/auth-context';

/**
 * Authenticated app frame: white top bar with the logo, nav, and account chip.
 * Pages with a "money moment" pass a `band` — a full-bleed Brand-Blue field
 * rendered flush under the bar (see index.html direction contract).
 */
export function AppShell({
  band,
  children,
}: {
  band?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const { address, logout } = useAuth();
  const [copied, setCopied] = useState(false);

  const truncated = address
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : '';

  const copyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-4 sm:gap-8 sm:px-6">
          {/* Clear space (brand kit): a 20px logo demands 12.6px of empty
              space on every side. The bar's px-4/py-4 (16px) and the gap-4
              (16px) to the nav clear that on the tightest breakpoint. */}
          <NavLink to="/dashboard" className="shrink-0">
            <BrandLogo className="h-5" />
          </NavLink>
          <nav className="flex gap-6 text-sm">
            <NavLink
              to="/dashboard"
              className={({ isActive }) =>
                isActive
                  ? 'font-semibold text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }
            >
              {t('shell.nav.dashboard')}
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitcher className="mr-1" />
            <button
              type="button"
              onClick={copyAddress}
              title={t('shell.copyAddress')}
              className="flex items-center gap-2 whitespace-nowrap rounded-full border border-border px-3 py-1.5 text-xs text-secondary-foreground transition-colors hover:bg-muted"
            >
              <code className="font-mono">{truncated}</code>
              {copied ? (
                <Check className="h-3.5 w-3.5 text-positive" aria-hidden />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden />
              )}
            </button>
            <button
              type="button"
              onClick={logout}
              title={t('shell.disconnect')}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">{t('shell.disconnect')}</span>
            </button>
          </div>
        </div>
      </header>

      {band && (
        <div className="band bg-linear-to-b from-band to-band-deep text-on-band">
          <div className="mx-auto max-w-5xl px-6 py-8">{band}</div>
        </div>
      )}

      <main className="mx-auto max-w-5xl px-6 pt-8 pb-20">{children}</main>
    </div>
  );
}
