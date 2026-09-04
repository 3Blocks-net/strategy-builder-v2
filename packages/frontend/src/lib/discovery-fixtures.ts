/**
 * Static content for the public discovery page.
 *
 * TRUTH BOUNDARY: the product is not live, so nothing here may look like a
 * measured result. Strategy entries describe real mechanics from the step
 * catalog (no performance figures — those appear only once they are real and
 * verifiable on-chain). Market rows are ILLUSTRATIVE SAMPLES and must stay
 * visibly labeled as such until a live market-data source replaces them.
 */

export type RiskLabel = 'Lower risk' | 'Medium risk' | 'Higher risk';

export interface StrategyExample {
  id: string;
  name: string;
  summary: string;
  risk: RiskLabel;
  /** The recipe's flow, condition first — rendered as the card schematic. */
  steps: { kind: 'condition' | 'action'; label: string }[];
  protocols: string[];
  assets: string;
}

export const strategyExamples: StrategyExample[] = [
  {
    id: 'wick-wait-rebalance',
    name: 'Wick-Wait Range Rebalance',
    summary:
      'Keeps a concentrated liquidity position earning fees: when the price leaves your range and holds there, the position is repositioned — brief wicks are deliberately sat out.',
    risk: 'Medium risk',
    steps: [
      { kind: 'condition', label: 'Price leaves range' },
      { kind: 'action', label: 'Swap to range ratio' },
      { kind: 'action', label: 'Reposition liquidity' },
    ],
    protocols: ['PancakeSwap V3'],
    assets: 'CAKE / WBNB',
  },
  {
    id: 'compound-fees',
    name: 'Fee Auto-Compound',
    summary:
      'Collects the trading fees your liquidity position earns on a schedule and reinvests them into the same position, so earnings start earning.',
    risk: 'Lower risk',
    steps: [
      { kind: 'condition', label: 'Every 7 days' },
      { kind: 'action', label: 'Collect earned fees' },
      { kind: 'action', label: 'Reinvest into position' },
    ],
    protocols: ['PancakeSwap V3'],
    assets: 'Any V3 position',
  },
  {
    id: 'scheduled-dca',
    name: 'Scheduled Accumulation',
    summary:
      'Swaps a fixed amount of stablecoins into a target asset on a fixed schedule — dollar-cost averaging that runs from your own vault.',
    risk: 'Lower risk',
    steps: [
      { kind: 'condition', label: 'On schedule' },
      { kind: 'action', label: 'Swap USDT → asset' },
    ],
    protocols: ['PancakeSwap V3'],
    assets: 'USDT → WBNB',
  },
];

export interface MarketSampleRow {
  asset: string;
  venue: string;
  kind: string;
  yieldNote: string;
}

/** SAMPLE DATA — rendered only under the visible "Illustrative sample" badge. */
export const marketSamples: MarketSampleRow[] = [
  { asset: 'CAKE / WBNB', venue: 'PancakeSwap V3 · 0.25%', kind: 'Liquidity pool', yieldNote: 'Trading fees' },
  { asset: 'USDT', venue: 'Venus', kind: 'Lending', yieldNote: 'Supply interest' },
  { asset: 'WBNB / USDT', venue: 'PancakeSwap V3 · 0.05%', kind: 'Liquidity pool', yieldNote: 'Trading fees' },
  { asset: 'BTCB', venue: 'Venus', kind: 'Lending', yieldNote: 'Supply interest' },
];
