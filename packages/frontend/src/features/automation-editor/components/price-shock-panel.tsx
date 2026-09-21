/**
 * The price-shock preview as the deploy dialog shows it.
 *
 * It answers one question before the signature: what does this automation do
 * if the market moves? Every figure comes from the pure core in
 * `lib/price-shock.ts`; this file only decides how the answers are worded.
 *
 * What it deliberately does NOT do is gate anything. The panel has no bearing
 * on the deploy button — an empty, failed or half-computed preview costs the
 * owner information, never the ability to act.
 */
import { Component, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useFormatters, type Formatters } from '@/i18n';
import { usePriceShockPreview } from '../hooks/use-price-shock-preview';
import type {
  HealthRow,
  PreviewRow,
  PreviewWarning,
  RangeRow,
  ShockPercent,
  SwapRow,
  UnavailableRow,
} from '../lib/price-shock';

/**
 * Three tones, because the outcomes are not simply good or bad: a swap that
 * reverts is the protection doing its job, and only a liquidation is an
 * outright loss. Colouring both red would cry wolf.
 */
const TONE = {
  ok: 'text-green-700',
  warn: 'text-amber-700',
  bad: 'text-red-700',
} as const;

type Tone = keyof typeof TONE;

function shockLabel(fmt: Formatters, shock: ShockPercent): string {
  return fmt.percent(shock / 100, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    signDisplay: 'exceptZero',
  });
}

function percent(fmt: Formatters, ratio: number): string {
  return fmt.percent(ratio, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** One step's six answers, laid out under the price moves they belong to. */
function ShockGrid({
  cells,
  fmt,
}: {
  cells: { shockPercent: ShockPercent; text: string; tone: Tone }[];
  fmt: Formatters;
}) {
  return (
    <div className="mt-2 grid grid-cols-3 gap-1 sm:grid-cols-6">
      {cells.map((cell) => (
        <div key={cell.shockPercent} className="rounded bg-white px-1.5 py-1 text-center">
          <div className="text-xs text-gray-500">{shockLabel(fmt, cell.shockPercent)}</div>
          <div className={`text-xs font-medium ${TONE[cell.tone]}`}>{cell.text}</div>
        </div>
      ))}
    </div>
  );
}

function RowFrame({ title, legend, children }: { title: string; legend: string; children: React.ReactNode }) {
  return (
    <div className="rounded bg-gray-50 p-3">
      <div className="text-sm font-medium text-gray-700">{title}</div>
      {children}
      <p className="mt-2 text-xs text-gray-500">{legend}</p>
    </div>
  );
}

/**
 * The reference window as the editor writes it: minutes where the seconds
 * divide evenly (every preset does), seconds otherwise. A unit, not prose —
 * the same shorthand the window picker itself uses.
 */
function windowLabel(seconds: number): string {
  return seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds} s`;
}

function SwapRowView({ row, t, fmt }: { row: SwapRow; t: TFunction; fmt: Formatters }) {
  return (
    <RowFrame
      title={`${row.stepName} · ${t('priceShock.swap.label', {
        tolerance: percent(fmt, row.tolerance),
      })}`}
      // Every cell below is a claim about a move *within* the reference
      // window, because that is the span the on-chain guard averages over. A
      // slower drift takes the reference with it and the swap fills. Stating
      // the outcomes without that span would promise protection the contract
      // does not give — right at the moment of signing.
      legend={
        row.twapWindowSeconds === null
          ? t('priceShock.swap.legendNoWindow')
          : t('priceShock.swap.legend', { window: windowLabel(row.twapWindowSeconds) })
      }
    >
      <ShockGrid
        fmt={fmt}
        cells={row.outcomes.map((o) => ({
          shockPercent: o.shockPercent,
          text: o.executes ? t('priceShock.swap.executes') : t('priceShock.swap.reverts'),
          tone: o.executes ? 'ok' : 'warn',
        }))}
      />
      <p className="mt-2 text-xs text-gray-500">
        {t('priceShock.swap.fallback', {
          value: percent(fmt, row.fallbackTolerance),
        })}
      </p>
      {row.poolShare !== null && (
        <p className="mt-2 text-xs text-gray-500">
          {t('priceShock.swap.share', { value: percent(fmt, row.poolShare) })}
        </p>
      )}
    </RowFrame>
  );
}

function RangeRowView({ row, t, fmt }: { row: RangeRow; t: TFunction; fmt: Formatters }) {
  return (
    <RowFrame
      title={`${row.stepName} · ${t('priceShock.range.label', {
        up: percent(fmt, row.widthUp),
        down: percent(fmt, row.widthDown),
      })}`}
      legend={t('priceShock.range.legend')}
    >
      <ShockGrid
        fmt={fmt}
        cells={row.outcomes.map((o) => ({
          shockPercent: o.shockPercent,
          text: o.inRange ? t('priceShock.range.inRange') : t('priceShock.range.outOfRange'),
          tone: o.inRange ? 'ok' : 'warn',
        }))}
      />
    </RowFrame>
  );
}

function healthValue(fmt: Formatters, value: number): string {
  return fmt.number(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * The Health Factor row.
 *
 * Every figure in it is a measurement of the vault as it stands right now, and
 * none of it is the Health Factor the vault will have once this automation has
 * run: the step moves the position only when its condition fires, at a price
 * nobody knows yet. A number that looks like a forecast but is a present-day
 * reading would be the worst of the options, so the row says outright which of
 * the two it is — and, where the step steers at a target, names that target
 * separately instead of quietly mixing it in.
 */
function HealthRowView({ row, t, fmt }: { row: HealthRow; t: TFunction; fmt: Formatters }) {
  return (
    <RowFrame
      title={`${row.stepName} · ${t('priceShock.health.label', {
        value: healthValue(fmt, row.healthFactor),
      })}`}
      legend={t('priceShock.health.legend')}
    >
      <ShockGrid
        fmt={fmt}
        cells={row.outcomes.map((o) => ({
          shockPercent: o.shockPercent,
          text: o.liquidatable
            ? t('priceShock.health.liquidation', { value: healthValue(fmt, o.healthFactor) })
            : healthValue(fmt, o.healthFactor),
          tone: o.liquidatable ? 'bad' : 'ok',
        }))}
      />
      {row.targetHealthFactor !== null && (
        <p className="mt-2 text-xs text-gray-500">
          {t('priceShock.health.target', {
            value: healthValue(fmt, row.targetHealthFactor),
          })}
        </p>
      )}
    </RowFrame>
  );
}

function UnavailableList({
  rows,
  loading,
  t,
}: {
  rows: UnavailableRow[];
  loading: boolean;
  t: TFunction;
}) {
  return (
    <div className="rounded bg-gray-50 p-3">
      <div className="text-sm font-medium text-gray-700">
        {t('priceShock.unavailableTitle')}
      </div>
      <ul className="mt-1 space-y-1 text-xs text-gray-600">
        {rows.map((row) => (
          <li key={row.nodeId}>
            {/* While the cockpit answer is still on its way, "could not be
                loaded" would be a claim about an attempt that has not finished. */}
            {loading && row.reason === 'no-lending-data'
              ? `${row.stepName}: ${t('priceShock.loading')}`
              : t(`priceShock.reason.${row.reason}`, { step: row.stepName })}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-gray-500">{t('priceShock.neverBlocks')}</p>
    </div>
  );
}

function warningText(t: TFunction, fmt: Formatters, warning: PreviewWarning): string {
  if (warning.kind === 'high-tolerance') {
    return t('priceShock.warning.high-tolerance', {
      step: warning.stepName,
      value: percent(fmt, warning.tolerance),
    });
  }
  return t('priceShock.warning.thin-pool', {
    step: warning.stepName,
    value: percent(fmt, warning.poolShare),
  });
}

/**
 * Last line of defence for the rule that matters most here: a preview that
 * breaks must cost the owner the preview, never the deploy dialog around it.
 * Without this, one bad figure would take the whole signing flow down.
 */
class PreviewBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function PriceShockPanel({ vaultAddress }: { vaultAddress?: string }) {
  const { t } = useTranslation();
  return (
    <PreviewBoundary
      fallback={
        <section aria-labelledby="price-shock-heading">
          <h3 id="price-shock-heading" className="mb-1 text-sm font-medium text-gray-700">
            {t('priceShock.heading')}
          </h3>
          <div className="rounded bg-gray-50 p-3">
            <p className="text-sm font-medium text-gray-700">
              {t('priceShock.unavailableTitle')}
            </p>
            <p className="mt-1 text-xs text-gray-600">{t('priceShock.neverBlocks')}</p>
          </div>
        </section>
      }
    >
      <PriceShockBody vaultAddress={vaultAddress} />
    </PreviewBoundary>
  );
}

function PriceShockBody({ vaultAddress }: { vaultAddress?: string }) {
  const { t } = useTranslation();
  const fmt = useFormatters();
  const { preview, loading } = usePriceShockPreview(vaultAddress);

  const computed = preview.rows.filter(
    (row): row is Exclude<PreviewRow, UnavailableRow> => row.kind !== 'unavailable',
  );
  const unavailable = preview.rows.filter(
    (row): row is UnavailableRow => row.kind === 'unavailable',
  );

  return (
    <section aria-labelledby="price-shock-heading">
      <h3 id="price-shock-heading" className="mb-1 text-sm font-medium text-gray-700">
        {t('priceShock.heading')}
      </h3>

      {preview.rows.length === 0 ? (
        <div className="rounded bg-gray-50 p-3">
          {loading ? (
            <p className="text-sm text-gray-600">{t('priceShock.loading')}</p>
          ) : (
            <>
              <p className="text-sm font-medium text-gray-700">
                {t('priceShock.emptyTitle')}
              </p>
              <p className="mt-1 text-xs text-gray-600">{t('priceShock.emptyBody')}</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">{t('priceShock.intro')}</p>

          {computed.map((row) => {
            if (row.kind === 'swap')
              return <SwapRowView key={row.nodeId} row={row} t={t} fmt={fmt} />;
            if (row.kind === 'lp-range')
              return <RangeRowView key={row.nodeId} row={row} t={t} fmt={fmt} />;
            return <HealthRowView key={row.nodeId} row={row} t={t} fmt={fmt} />;
          })}

          {unavailable.length > 0 && (
            <UnavailableList rows={unavailable} loading={loading} t={t} />
          )}

          {preview.warnings.length > 0 && (
            <div className="rounded bg-amber-50 p-3">
              <div className="text-sm font-medium text-amber-800">
                {t('priceShock.warningTitle')}
              </div>
              <ul className="mt-1 space-y-1 text-xs text-amber-700">
                {preview.warnings.map((warning) => (
                  <li key={`${warning.kind}-${warning.nodeId}`}>
                    {warningText(t, fmt, warning)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
