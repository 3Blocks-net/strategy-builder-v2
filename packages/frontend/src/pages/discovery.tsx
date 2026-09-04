import { Link } from 'react-router';
import { KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  marketSamples,
  strategyExamples,
  type StrategyExample,
} from '@/lib/discovery-fixtures';

/**
 * Public discovery page (wireframes.md 3.1, mode: Persuade).
 * Sells with verifiable facts only: real strategy mechanics from the step
 * catalog, no performance figures until they exist on-chain.
 */
export function DiscoveryPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-4 sm:gap-8 sm:px-6">
          <span className="font-wordmark text-xl font-semibold tracking-tight">
            pecunity
          </span>
          <nav className="hidden gap-6 text-sm text-muted-foreground sm:flex">
            <a href="#strategies" className="hover:text-foreground">
              Strategies
            </a>
            <a href="#markets" className="hover:text-foreground">
              Markets
            </a>
            <a href="#how" className="hover:text-foreground">
              How it works
            </a>
          </nav>
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

      <div className="band bg-linear-to-b from-band to-band-deep text-on-band">
        <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
            DeFi that feels like a broker.
          </h1>
          <p className="mt-4 max-w-xl text-base text-on-band-sub">
            Portfolio, strategies, and automation in one place — running from a
            vault only you control.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="bg-white text-band-deep hover:bg-on-band-sub">
              <Link to="/connect">Launch App</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-on-band-line bg-transparent text-on-band shadow-none hover:bg-white/10 hover:text-on-band"
            >
              <a href="#strategies">See strategies</a>
            </Button>
          </div>
          <ul className="mt-10 flex flex-wrap gap-x-8 gap-y-2 text-sm text-on-band-sub">
            <li className="flex items-center gap-2">
              <Lock className="h-4 w-4" aria-hidden />
              Funds never leave your own vault
            </li>
            <li className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" aria-hidden />
              Every action needs your signature
            </li>
            <li className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" aria-hidden />
              Automation executes only rules you deployed
            </li>
          </ul>
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-6 pb-20">
        <section id="strategies" className="scroll-mt-8 pt-14">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-3">
            <h2 className="text-lg font-semibold tracking-tight">Strategies</h2>
            <p className="text-xs text-muted-foreground">
              Built from Pecunity's live step catalog
            </p>
          </div>
          <div className="grid gap-4 pt-6 md:grid-cols-3">
            {strategyExamples.map((s) => (
              <StrategyCard key={s.id} strategy={s} />
            ))}
          </div>
          <p className="pt-6 text-sm text-muted-foreground">
            You'll see no yield promises here: performance figures appear only
            once strategies run in production and their track record is
            verifiable on-chain.
          </p>
        </section>

        <section id="markets" className="scroll-mt-8 pt-14">
          <div className="flex flex-wrap items-baseline gap-3 border-b border-border pb-3">
            <h2 className="text-lg font-semibold tracking-tight">Markets</h2>
            <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
              Illustrative sample
            </span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="py-3 pr-4 text-left font-medium">Asset</th>
                <th className="px-4 py-3 text-left font-medium">Venue</th>
                <th className="hidden px-4 py-3 text-left font-medium sm:table-cell">
                  Type
                </th>
                <th className="py-3 pl-4 text-right font-medium">Yield source</th>
              </tr>
            </thead>
            <tbody>
              {marketSamples.map((m) => (
                <tr key={`${m.asset}-${m.venue}`} className="border-b border-border last:border-0">
                  <td className="py-4 pr-4 font-medium">{m.asset}</td>
                  <td className="px-4 py-4 text-muted-foreground">{m.venue}</td>
                  <td className="hidden px-4 py-4 text-muted-foreground sm:table-cell">
                    {m.kind}
                  </td>
                  <td className="py-4 pl-4 text-right text-muted-foreground">
                    {m.yieldNote}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="pt-4 text-sm text-muted-foreground">
            Live rates and pool data land with the public launch — like price
            lists at a broker, but for pools and lending markets on BSC.
          </p>
        </section>

        <section id="how" className="scroll-mt-8 pt-14">
          <h2 className="border-b border-border pb-3 text-lg font-semibold tracking-tight">
            How it works
          </h2>
          <ol className="divide-y divide-border">
            <HowStep
              n={1}
              title="Connect a wallet"
              text="Signing in is a free wallet signature — no allowance, no custody. Your keys stay yours, always."
            />
            <HowStep
              n={2}
              title="Pick or compose a strategy"
              text="Start from a strategy setup, or compose your own from building blocks in the graph editor — with validation that catches on-chain errors before they cost you."
            />
            <HowStep
              n={3}
              title="It runs by your rules"
              text="Your strategy deploys into your own vault contract. Keepers can only execute what you deployed, and every allowance is confirmed by you — one signature at a time."
            />
          </ol>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-8 gap-y-3 px-6 py-8 text-sm text-muted-foreground">
          <span className="font-wordmark text-base font-semibold tracking-tight text-foreground">
            pecunity
          </span>
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

function StrategyCard({ strategy }: { strategy: StrategyExample }) {
  return (
    <article className="group flex flex-col rounded-md border border-border p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold tracking-tight">
          {strategy.name}
        </h3>
        <span className="mt-0.5 shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
          {strategy.risk}
        </span>
      </div>
      <p className="mt-2 flex-1 text-sm text-secondary-foreground">
        {strategy.summary}
      </p>

      <StepFlow steps={strategy.steps} />

      <dl className="mt-4 space-y-1 border-t border-border pt-3 text-xs">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Protocols</dt>
          <dd className="text-right">{strategy.protocols.join(', ')}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Assets</dt>
          <dd className="text-right">{strategy.assets}</dd>
        </div>
      </dl>
    </article>
  );
}

/**
 * The card's signature: the strategy's real condition→action chain drawn as a
 * flow. On hover the connectors "run", dramatizing that the recipe executes.
 */
function StepFlow({ steps }: { steps: StrategyExample['steps'] }) {
  return (
    <ul className="mt-4" aria-label="Strategy flow">
      {steps.map((step, i) => (
        <li key={step.label}>
          {i > 0 && (
            <span
              className="ml-4 block h-3 w-px bg-border transition-colors duration-200 ease-out group-hover:bg-primary"
              style={{ transitionDelay: `${(2 * i - 1) * 110}ms` }}
              aria-hidden
            />
          )}
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs transition-colors duration-200 ease-out ${
              step.kind === 'condition'
                ? 'bg-primary font-medium text-primary-foreground'
                : 'border border-border bg-background text-secondary-foreground group-hover:border-primary group-hover:text-foreground'
            }`}
            style={i > 0 ? { transitionDelay: `${2 * i * 110}ms` } : undefined}
          >
            {step.label}
          </span>
        </li>
      ))}
    </ul>
  );
}

function HowStep({ n, title, text }: { n: number; title: string; text: string }) {
  return (
    <li className="flex gap-5 py-6">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
        {n}
      </span>
      <div>
        <h3 className="text-base font-semibold tracking-tight">{title}</h3>
        <p className="mt-1 max-w-xl text-sm text-secondary-foreground">{text}</p>
      </div>
    </li>
  );
}
