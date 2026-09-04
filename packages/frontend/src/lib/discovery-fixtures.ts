/**
 * Static content for the public discovery page.
 *
 * TRUTH BOUNDARY: the product is not live, so nothing here may look like a
 * measured result. Strategy entries describe real mechanics from the step
 * catalog (no performance figures — those appear only once they are real and
 * verifiable on-chain). Market rows are ILLUSTRATIVE SAMPLES and must stay
 * visibly labeled as such until a live market-data source replaces them.
 *
 * Everything a reader reads lives in the catalogs (`i18n/locales`, under
 * `discovery`), addressed by the ids below; what stays here is the structure
 * plus the values that are the same in every language — protocol names and
 * token symbols.
 */

export type RiskLevel = 'lower' | 'medium' | 'higher';

export type StrategyStepKind = 'condition' | 'action';

/** Ids are catalog keys, so they are unions rather than free strings. */
export type StrategyExampleId =
  | 'wick-wait-rebalance'
  | 'compound-fees'
  | 'scheduled-dca';

export type StrategyStepId =
  | 'price-leaves-range'
  | 'swap-to-range-ratio'
  | 'reposition-liquidity'
  | 'every-7-days'
  | 'collect-fees'
  | 'reinvest'
  | 'on-schedule'
  | 'swap-usdt';

export interface StrategyExample {
  /** Key into `discovery.examples` for name, summary and assets. */
  id: StrategyExampleId;
  risk: RiskLevel;
  /** The recipe's flow, condition first — rendered as the card schematic. */
  steps: { kind: StrategyStepKind; id: StrategyStepId }[];
  /** Proper names of protocols: identical in every language. */
  protocols: string[];
}

export const strategyExamples: StrategyExample[] = [
  {
    id: 'wick-wait-rebalance',
    risk: 'medium',
    steps: [
      { kind: 'condition', id: 'price-leaves-range' },
      { kind: 'action', id: 'swap-to-range-ratio' },
      { kind: 'action', id: 'reposition-liquidity' },
    ],
    protocols: ['PancakeSwap V3'],
  },
  {
    id: 'compound-fees',
    risk: 'lower',
    steps: [
      { kind: 'condition', id: 'every-7-days' },
      { kind: 'action', id: 'collect-fees' },
      { kind: 'action', id: 'reinvest' },
    ],
    protocols: ['PancakeSwap V3'],
  },
  {
    id: 'scheduled-dca',
    risk: 'lower',
    steps: [
      { kind: 'condition', id: 'on-schedule' },
      { kind: 'action', id: 'swap-usdt' },
    ],
    protocols: ['PancakeSwap V3'],
  },
];

export type MarketKind = 'liquidityPool' | 'lending';
export type MarketYieldNote = 'tradingFees' | 'supplyInterest';

export interface MarketSampleRow {
  /** Token symbols and venue names — not translated. */
  asset: string;
  venue: string;
  /** Keys into `discovery.markets.kind` / `.yieldNote`. */
  kind: MarketKind;
  yieldNote: MarketYieldNote;
}

/** SAMPLE DATA — rendered only under the visible "Illustrative sample" badge. */
export const marketSamples: MarketSampleRow[] = [
  { asset: 'CAKE / WBNB', venue: 'PancakeSwap V3 · 0.25%', kind: 'liquidityPool', yieldNote: 'tradingFees' },
  { asset: 'USDT', venue: 'Venus', kind: 'lending', yieldNote: 'supplyInterest' },
  { asset: 'WBNB / USDT', venue: 'PancakeSwap V3 · 0.05%', kind: 'liquidityPool', yieldNote: 'tradingFees' },
  { asset: 'BTCB', venue: 'Venus', kind: 'lending', yieldNote: 'supplyInterest' },
];
