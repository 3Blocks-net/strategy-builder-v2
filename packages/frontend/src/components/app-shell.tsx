import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router';
import { Check, Copy, LogOut } from 'lucide-react';
import { useAuth } from '@/providers/auth-context';

/**
 * Authenticated app frame: white top bar with wordmark, nav, and account chip.
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
          <NavLink
            to="/dashboard"
            className="font-wordmark text-xl font-semibold tracking-tight text-foreground"
          >
            pecunity
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
              Dashboard
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={copyAddress}
              title="Copy wallet address"
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
              title="Disconnect"
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">Disconnect</span>
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
