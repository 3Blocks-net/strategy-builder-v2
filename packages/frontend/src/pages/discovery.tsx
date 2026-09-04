import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { PublicShell } from '@/components/public-shell';
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
  const { t } = useTranslation();

  const nav = [
    { href: '#strategies', label: t('discovery.nav.strategies') },
    { href: '#markets', label: t('discovery.nav.markets') },
    { href: '#how', label: t('discovery.nav.how') },
  ];

  return (
    <PublicShell nav={nav} band={<Hero />}>
      <section id="strategies" className="scroll-mt-8 pt-14">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-3">
          <h2 className="text-lg font-semibold tracking-tight">
            {t('discovery.strategies.heading')}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t('discovery.strategies.source')}
          </p>
        </div>
        <div className="grid gap-4 pt-6 md:grid-cols-3">
          {strategyExamples.map((s) => (
            <StrategyCard key={s.id} strategy={s} />
          ))}
        </div>
        <p className="pt-6 text-sm text-muted-foreground">
          {t('discovery.strategies.noPromises')}
        </p>
      </section>

      <section id="markets" className="scroll-mt-8 pt-14">
        <div className="flex flex-wrap items-baseline gap-3 border-b border-border pb-3">
          <h2 className="text-lg font-semibold tracking-tight">
            {t('discovery.markets.heading')}
          </h2>
          <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
            {t('discovery.markets.sampleBadge')}
          </span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="py-3 pr-4 text-left font-medium">
                {t('discovery.markets.asset')}
              </th>
              <th className="px-4 py-3 text-left font-medium">
                {t('discovery.markets.venue')}
              </th>
              <th className="hidden px-4 py-3 text-left font-medium sm:table-cell">
                {t('discovery.markets.type')}
              </th>
              <th className="py-3 pl-4 text-right font-medium">
                {t('discovery.markets.yieldSource')}
              </th>
            </tr>
          </thead>
          <tbody>
            {marketSamples.map((m) => (
              <tr key={`${m.asset}-${m.venue}`} className="border-b border-border last:border-0">
                <td className="py-4 pr-4 font-medium">{m.asset}</td>
                <td className="px-4 py-4 text-muted-foreground">{m.venue}</td>
                <td className="hidden px-4 py-4 text-muted-foreground sm:table-cell">
                  {t(`discovery.markets.kind.${m.kind}`)}
                </td>
                <td className="py-4 pl-4 text-right text-muted-foreground">
                  {t(`discovery.markets.yieldNote.${m.yieldNote}`)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="pt-4 text-sm text-muted-foreground">
          {t('discovery.markets.footnote')}
        </p>
      </section>

      <section id="how" className="scroll-mt-8 pt-14">
        <h2 className="border-b border-border pb-3 text-lg font-semibold tracking-tight">
          {t('discovery.how.heading')}
        </h2>
        <ol className="divide-y divide-border">
          <HowStep
            n={1}
            title={t('discovery.how.connectTitle')}
            text={t('discovery.how.connectText')}
          />
          <HowStep
            n={2}
            title={t('discovery.how.composeTitle')}
            text={t('discovery.how.composeText')}
          />
          <HowStep
            n={3}
            title={t('discovery.how.runsTitle')}
            text={t('discovery.how.runsText')}
          />
        </ol>
      </section>
    </PublicShell>
  );
}

/**
 * The hero, rendered inside the shell's Brand-Blue band.
 */
function Hero() {
  const { t } = useTranslation();

  return (
    <>
      <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
        {t('discovery.hero.headline')}
      </h1>
      <p className="mt-4 max-w-xl text-base text-on-band-sub">
        {t('discovery.hero.subline')}
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Button asChild size="lg" className="bg-white text-band-deep hover:bg-on-band-sub">
          <Link to="/connect">{t('shell.launchApp')}</Link>
        </Button>
        <Button
          asChild
          size="lg"
          variant="outline"
          className="border-on-band-line bg-transparent text-on-band shadow-none hover:bg-white/10 hover:text-on-band"
        >
          <a href="#strategies">{t('discovery.hero.seeStrategies')}</a>
        </Button>
      </div>
      {/* items-start, not items-center: the German promises wrap into two
          lines, and the icon has to stay on the first one. */}
      <ul className="mt-10 flex flex-wrap gap-x-8 gap-y-2 text-sm text-on-band-sub">
        <li className="flex items-start gap-2">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {t('discovery.hero.trustFunds')}
        </li>
        <li className="flex items-start gap-2">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {t('discovery.hero.trustSignature')}
        </li>
        <li className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {t('discovery.hero.trustAutomation')}
        </li>
      </ul>
    </>
  );
}

function StrategyCard({ strategy }: { strategy: StrategyExample }) {
  const { t } = useTranslation();

  return (
    <article className="group flex flex-col rounded-md border border-border p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold tracking-tight">
          {t(`discovery.examples.${strategy.id}.name`)}
        </h3>
        <span className="mt-0.5 shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
          {t(`discovery.risk.${strategy.risk}`)}
        </span>
      </div>
      <p className="mt-2 flex-1 text-sm text-secondary-foreground">
        {t(`discovery.examples.${strategy.id}.summary`)}
      </p>

      <StepFlow strategy={strategy} />

      <dl className="mt-4 space-y-1 border-t border-border pt-3 text-xs">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">
            {t('discovery.strategies.protocols')}
          </dt>
          <dd className="text-right">{strategy.protocols.join(', ')}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">
            {t('discovery.strategies.assets')}
          </dt>
          <dd className="text-right">
            {t(`discovery.examples.${strategy.id}.assets`)}
          </dd>
        </div>
      </dl>
    </article>
  );
}

/**
 * The card's signature: the strategy's real condition→action chain drawn as a
 * flow. On hover the connectors "run", dramatizing that the recipe executes.
 */
function StepFlow({ strategy }: { strategy: StrategyExample }) {
  const { t } = useTranslation();

  return (
    <ul className="mt-4" aria-label={t('discovery.strategies.flowLabel')}>
      {strategy.steps.map((step, i) => (
        <li key={step.id}>
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
            {t(`discovery.stepLabels.${step.id}`)}
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
