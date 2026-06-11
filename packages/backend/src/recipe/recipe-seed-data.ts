import type { RecipeDefinition } from './recipe-validation';

/**
 * Team-kuratierte Recipe-Formen (HITL-reviewed). Jede Form ist ein Platzhalter-Graph
 * mit stabilen Step-Type-Namen und Platzhalter-Werten (TOKEN_IN, BETRAG, INTERVALL …).
 * Der Seed validiert sie gegen den aktuellen Katalog; nicht-ausdrückbare/driftende
 * Formen werden NICHT ausgeliefert. Kein User-/Community-Schreibpfad.
 *
 * Hinweis: Preis-getriggerte Strategien (Stop-Loss) und Health-Factor-Schutz sind mit
 * dem heutigen Condition-Katalog (Token-Balance / Interval / Timer) nicht ausdrückbar
 * (keine Preis-/HF-Condition) — bewusst ausgelassen, bis solche Conditions existieren.
 */
export const RECIPES: RecipeDefinition[] = [
  {
    key: 'dca',
    name: 'DCA — Dollar-Cost-Averaging',
    description:
      'Kauft in festen Intervallen für einen festen Betrag einen Zieltoken ' +
      '(z. B. wöchentlich für BETRAG TOKEN_IN → TOKEN_OUT). Interval-Trigger → Swap.',
    category: 'accumulation',
    shape: {
      nodes: [
        { id: 'trigger', stepType: 'Interval Condition', params: { interval: 'INTERVALL' } },
        {
          id: 'buy',
          stepType: 'PancakeSwap V3 Swap',
          params: { tokenIn: 'TOKEN_IN', tokenOut: 'TOKEN_OUT', fee: 'FEE_TIER', amountIn: 'BETRAG' },
        },
      ],
      edges: [{ source: 'trigger', target: 'buy', sourceHandle: 'out' }],
    },
  },
  {
    key: 'interval-aave-supply',
    name: 'Interval Aave Supply',
    description:
      'Supplied in festen Intervallen einen Betrag eines Assets in Aave V3 ' +
      '(z. B. wöchentlich BETRAG TOKEN). Interval-Trigger → Aave V3 Supply.',
    category: 'yield',
    shape: {
      nodes: [
        { id: 'trigger', stepType: 'Interval Condition', params: { interval: 'INTERVALL' } },
        {
          id: 'supply',
          stepType: 'Aave V3 Supply',
          params: { asset: 'TOKEN', mode: 'MODE', amount: 'BETRAG' },
        },
      ],
      edges: [{ source: 'trigger', target: 'supply', sourceHandle: 'out' }],
    },
  },
  {
    key: 'pancake-auto-reinvest',
    name: 'PancakeSwap Auto-Reinvest',
    description:
      'Erntet in festen Intervallen die Gebühren einer PancakeSwap-V3-LP-Position und ' +
      'reinvestiert sie in dieselbe Position. Interval → Collect → Increase Liquidity. ' +
      'Die Position-ID kommt aus einem Kontext-Slot (LP_POSITION_SLOT).',
    category: 'compounding',
    shape: {
      nodes: [
        { id: 'trigger', stepType: 'Interval Condition', params: { interval: 'INTERVALL' } },
        {
          id: 'collect',
          stepType: 'PancakeSwap V3 Collect',
          params: { tokenIdFromSlot: 'LP_POSITION_SLOT' },
        },
        {
          id: 'reinvest',
          stepType: 'PancakeSwap V3 Increase Liquidity',
          params: {
            tokenA: 'TOKEN_A',
            tokenB: 'TOKEN_B',
            tokenIdFromSlot: 'LP_POSITION_SLOT',
            amountADesired: 'BETRAG_A',
            amountBDesired: 'BETRAG_B',
          },
        },
      ],
      edges: [
        { source: 'trigger', target: 'collect', sourceHandle: 'out' },
        { source: 'collect', target: 'reinvest', sourceHandle: 'out' },
      ],
    },
  },
  {
    key: 'interval-rebalance',
    name: 'Interval Rebalance',
    description:
      'Stellt in festen Intervallen ein Zielverhältnis wieder her, indem ein Betrag ' +
      'von einem Token in den anderen getauscht wird. Interval-Trigger → Swap.',
    category: 'rebalancing',
    shape: {
      nodes: [
        { id: 'trigger', stepType: 'Interval Condition', params: { interval: 'INTERVALL' } },
        {
          id: 'swap',
          stepType: 'PancakeSwap V3 Swap',
          params: { tokenIn: 'TOKEN_FROM', tokenOut: 'TOKEN_TO', fee: 'FEE_TIER', amountIn: 'BETRAG' },
        },
      ],
      edges: [{ source: 'trigger', target: 'swap', sourceHandle: 'out' }],
    },
  },
];
