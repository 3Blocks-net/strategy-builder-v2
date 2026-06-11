import { describe, it, expect } from 'vitest';
import type { RawGraph } from 'shared';
import { decodeRawGraph, type DecoderCatalog } from './summary-decoder.js';

const TRANSFER = 'st-transfer';
const SUPPLY = 'st-supply';
const INTERVAL = 'st-interval';
const TOKEN18 = '0xAAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa';
const TOKEN6 = '0xBbBBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB';
const RECIPIENT = '0x1111111111111111111111111111111111111111';

const catalog: DecoderCatalog = {
  [TRANSFER]: {
    name: 'ERC-20 Transfer',
    paramSchema: {
      properties: {
        token: { 'x-ui-widget': 'token-selector' },
        recipient: { 'x-ui-role': 'recipient' },
        amount: { 'x-ui-widget': 'token-amount', 'x-ui-amount-token-field': 'token' },
      },
    },
    abiFragment: {
      type: 'tuple',
      components: [
        { name: 'token', type: 'address' },
        { name: 'recipient', type: 'address' },
        { name: 'amount', type: 'uint256' },
      ],
    },
  },
  [SUPPLY]: {
    name: 'Aave V3 Supply',
    paramSchema: {
      properties: {
        asset: { 'x-ui-widget': 'token-selector' },
        mode: { 'x-ui-widget': 'aave-amount-mode' },
        amount: { 'x-ui-widget': 'token-amount', 'x-ui-amount-token-field': 'asset' },
      },
    },
    abiFragment: {
      type: 'tuple',
      components: [
        { name: 'asset', type: 'address' },
        { name: 'mode', type: 'uint8' },
        { name: 'amount', type: 'uint256' },
      ],
    },
  },
  [INTERVAL]: {
    name: 'Interval Condition',
    paramSchema: { properties: { interval: { 'x-ui-widget': 'duration' } } },
    abiFragment: { type: 'tuple', components: [{ name: 'interval', type: 'uint256' }] },
  },
};

const decimals = { [TOKEN18.toLowerCase()]: 18, [TOKEN6.toLowerCase()]: 6 };

function transferGraph(amount: string, recipient = RECIPIENT, token = TOKEN18): RawGraph {
  return {
    nodes: [
      { id: 'a1', type: 'ACTION', data: { stepTypeId: TRANSFER, params: { token, recipient, amount } } },
    ],
    edges: [],
  };
}

describe('decodeRawGraph', () => {
  it('decodiert Token, Empfänger und human-Betrag schema-getrieben', () => {
    const summary = decodeRawGraph(transferGraph('1500000000000000000'), catalog, decimals, 'owner');
    expect(summary.execution).toBe('owner');
    expect(summary.warnings).toEqual([]);
    expect(summary.steps[0]).toMatchObject({
      stepType: 'ERC-20 Transfer',
      category: 'ACTION',
      token: TOKEN18,
      recipient: RECIPIENT,
      amount: '1.5',
      amountRaw: '1500000000000000000',
    });
  });

  it('nutzt die korrekten Token-Decimals (6 vs 18) für den human-Betrag', () => {
    const s18 = decodeRawGraph(transferGraph('1500000000000000000', RECIPIENT, TOKEN18), catalog, decimals);
    const s6 = decodeRawGraph(transferGraph('1500000', RECIPIENT, TOKEN6), catalog, decimals);
    expect(s18.steps[0].amount).toBe('1.5');
    expect(s6.steps[0].amount).toBe('1.5');
  });

  it('decodiert die Richtung (mode) eines Aave-Supply schema-getrieben', () => {
    const graph: RawGraph = {
      nodes: [{ id: 'a1', type: 'ACTION', data: { stepTypeId: SUPPLY, params: { asset: TOKEN18, mode: 2, amount: '1000000000000000000' } } }],
      edges: [],
    };
    const s = decodeRawGraph(graph, catalog, decimals);
    expect(s.steps[0]).toMatchObject({ token: TOKEN18, direction: 2, amount: '1' });
  });

  it('Beweis: ein manipulierter raw graph erzeugt eine ABWEICHENDE Summary', () => {
    const original = decodeRawGraph(transferGraph('1500000000000000000', RECIPIENT), catalog, decimals);
    const tampered = decodeRawGraph(
      transferGraph('9999000000000000000000', '0x2222222222222222222222222222222222222222'),
      catalog,
      decimals,
    );
    expect(tampered.steps[0].amount).not.toBe(original.steps[0].amount);
    expect(tampered.steps[0].recipient).not.toBe(original.steps[0].recipient);
  });

  it('Step OHNE Rollen-Annotation am Empfänger-Feld → Warnung (kein stilles Weglassen)', () => {
    const badCatalog: DecoderCatalog = {
      [TRANSFER]: {
        name: 'ERC-20 Transfer',
        paramSchema: { properties: { token: { 'x-ui-widget': 'token-selector' }, recipient: { type: 'string' } } },
        abiFragment: {
          type: 'tuple',
          components: [
            { name: 'token', type: 'address' },
            { name: 'recipient', type: 'address' },
            { name: 'amount', type: 'uint256' },
          ],
        },
      },
    };
    const s = decodeRawGraph(transferGraph('1000000000000000000'), badCatalog, decimals);
    expect(s.warnings.join(' ')).toMatch(/recipient/i);
  });

  it('unbekannte Token-Decimals → Betrag wird markiert (Warnung), nicht still weggelassen', () => {
    const s = decodeRawGraph(transferGraph('1000000000000000000', RECIPIENT, '0xUnknownTokenAddr'), catalog, decimals);
    expect(s.steps[0].amount).toBeUndefined();
    expect(s.warnings.join(' ')).toMatch(/decimals|Betrag/i);
  });

  it('unbekannte Step-Type-ID → Warnung', () => {
    const graph: RawGraph = { nodes: [{ id: 'x', type: 'ACTION', data: { stepTypeId: 'ghost', params: {} } }], edges: [] };
    const s = decodeRawGraph(graph, catalog, decimals);
    expect(s.warnings.join(' ')).toMatch(/ghost|unbekannt|unknown/i);
  });
});
