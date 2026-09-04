import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The one place the wordmark is spelled out. Every shell renders it through
 * here, so a new public page inherits the brand cut instead of copying it.
 */
function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn('font-wordmark font-semibold tracking-tight', className)}
    >
      pecunity
    </span>
  );
}

type NavItem = {
  href: string;
  label: string;
};

/**
 * Public app frame for everything reachable without a wallet (wireframes.md 2,
 * "Zwei Schalen, ein Produkt"). Deliberately carries no wallet chip — that
 * belongs to the authenticated shell.
 *
 * Two forms:
 * - `site` (default): top bar with wordmark, page navigation and the sign-in
 *   call-to-action, plus the shared footer. For the shop window pages.
 * - `entry`: no bar, no footer — the wordmark sits in the band above a narrow
 *   column. For the sign-in door, which must stay a door, not a form.
 *
 * `band` is the full-bleed Brand-Blue field under the bar (see index.html
 * direction contract): the hero on `site`, the line under the wordmark on
 * `entry`.
 */
export function PublicShell({
  variant = 'site',
  nav,
  band,
  children,
}: {
  variant?: 'site' | 'entry';
  nav?: readonly NavItem[];
  band?: ReactNode;
  children: ReactNode;
}) {
  if (variant === 'entry') {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <div className="band bg-linear-to-b from-band to-band-deep text-on-band">
          <div className="mx-auto max-w-md px-6 py-12 text-center">
            <Wordmark className="block text-3xl text-on-band" />
            {band}
          </div>
        </div>

        <div className="mx-auto w-full max-w-md flex-1 px-6 py-10">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-4 sm:gap-8 sm:px-6">
          <Wordmark className="text-xl" />
          {nav && nav.length > 0 && (
            <nav className="hidden gap-6 text-sm text-muted-foreground sm:flex">
              {nav.map((item) => (
                <a key={item.href} href={item.href} className="hover:text-foreground">
                  {item.label}
                </a>
              ))}
            </nav>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link to="/connect">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/connect">Launch App</Link>
            </Button>
          </div>
        </div>
      </header>

      {band && (
        <div className="band bg-linear-to-b from-band to-band-deep text-on-band">
          <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">{band}</div>
        </div>
      )}

      <main className="mx-auto max-w-5xl px-6 pb-20">{children}</main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-8 gap-y-3 px-6 py-8 text-sm text-muted-foreground">
          <Wordmark className="text-base text-foreground" />
          <a
            href="https://docs.octodefi.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground"
          >
            Documentation
          </a>
          <a href="mailto:info@pecunity.io" className="hover:text-foreground">
            Contact
          </a>
          <span className="ml-auto flex items-center gap-2">
            <span className="rounded-full border border-border px-2 py-0.5 text-xs">
              BSC
            </span>
            © 2026 Pecunity
          </span>
        </div>
      </footer>
    </div>
  );
}
