import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { BrandLogo } from '@/components/brand-logo';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The one place the wordmark is spelled out as text. The brand mark itself is
 * the logo file (`BrandLogo`); this typographic cut stays for the footer,
 * where the name reads as one more line of text rather than as a lockup.
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
 * - `site` (default): top bar with the logo, page navigation and the sign-in
 *   call-to-action, plus the shared footer. For the shop window pages.
 * - `entry`: no bar, no footer — the logo sits in the band above a narrow
 *   column. For the sign-in door, which must stay a door, not a form.
 *
 * `band` is the full-bleed Brand-Blue field under the bar (see index.html
 * direction contract): the hero on `site`, the line under the logo on
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
  const { t } = useTranslation();

  if (variant === 'entry') {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <div className="band bg-linear-to-b from-band to-band-deep text-on-band">
          <div className="mx-auto max-w-md px-6 py-12 text-center">
            {/* The band is Brand Blue, and the color symbol would sit on a
                near-identical blue — the brand kit's low-contrast rule. The
                mono cut is the file made for exactly this. Clear space: a
                32px logo demands 20.1px, and the wrapper's pb-6 (24px) plus
                the band's py-12 (48px) carry it. */}
            <div className="pb-6">
              <BrandLogo background="dark" tone="mono" className="mx-auto h-8" />
            </div>
            {band}
          </div>
        </div>

        <div className="mx-auto w-full max-w-md flex-1 px-6 py-10">
          <div className="flex justify-end pb-4">
            <LanguageSwitcher />
          </div>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-4 sm:gap-8 sm:px-6">
          {/* Clear space (brand kit): a 20px logo demands 12.6px on every
              side; px-4/py-4 (16px) and the gap-4 (16px) to the nav hold. */}
          <BrandLogo className="h-5 shrink-0" />
          {nav && nav.length > 0 && (
            // md, not sm: the German page names are a third wider than the
            // English ones and would push the sign-in buttons off a 640px bar.
            <nav className="hidden gap-6 text-sm text-muted-foreground md:flex">
              {nav.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="whitespace-nowrap hover:text-foreground"
                >
                  {item.label}
                </a>
              ))}
            </nav>
          )}
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitcher className="mr-1" />
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link to="/connect">{t('shell.signIn')}</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/connect">{t('shell.launchApp')}</Link>
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
            {t('shell.documentation')}
          </a>
          <a href="mailto:info@pecunity.io" className="hover:text-foreground">
            {t('shell.contact')}
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
