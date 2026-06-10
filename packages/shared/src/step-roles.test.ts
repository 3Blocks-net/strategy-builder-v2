import { describe, it, expect } from 'vitest';
import { resolveFieldRole, findUnannotatedRecipients } from './step-roles';
import type { StepSchema } from './encode-boundary';

describe('resolveFieldRole', () => {
  it('liest die explizite x-ui-role', () => {
    expect(resolveFieldRole({ 'x-ui-role': 'recipient' })).toBe('recipient');
    expect(resolveFieldRole({ 'x-ui-role': 'direction' })).toBe('direction');
  });

  it('leitet die Rolle aus dem x-ui-widget ab', () => {
    expect(resolveFieldRole({ 'x-ui-widget': 'token-selector' })).toBe('token');
    expect(resolveFieldRole({ 'x-ui-widget': 'token-amount' })).toBe('amount');
    expect(resolveFieldRole({ 'x-ui-widget': 'account-selector' })).toBe('recipient');
  });

  it('explizite Rolle schlägt die Widget-Ableitung', () => {
    expect(resolveFieldRole({ 'x-ui-widget': 'token-selector', 'x-ui-role': 'recipient' })).toBe('recipient');
  });

  it('unbekannt → undefined', () => {
    expect(resolveFieldRole({ type: 'string' })).toBeUndefined();
    expect(resolveFieldRole(undefined)).toBeUndefined();
  });
});

describe('findUnannotatedRecipients', () => {
  const transferOk: StepSchema & { name: string } = {
    name: 'ERC-20 Transfer',
    abiFragment: {
      type: 'tuple',
      components: [
        { name: 'token', type: 'address' },
        { name: 'recipient', type: 'address' },
        { name: 'amount', type: 'uint256' },
      ],
    },
    paramSchema: {
      properties: {
        token: { 'x-ui-widget': 'token-selector' },
        recipient: { 'x-ui-role': 'recipient' },
      },
    },
  };

  it('markiert ein Empfänger-Feld OHNE recipient-Rolle als Lücke', () => {
    const missing: StepSchema & { name: string } = {
      ...transferOk,
      paramSchema: { properties: { recipient: { type: 'string' } } },
    };
    expect(findUnannotatedRecipients([missing])).toEqual([
      { step: 'ERC-20 Transfer', field: 'recipient' },
    ]);
  });

  it('akzeptiert ein als recipient markiertes Empfänger-Feld', () => {
    expect(findUnannotatedRecipients([transferOk])).toEqual([]);
  });

  it('akzeptiert account-selector als Empfänger-Markierung (abgeleitet)', () => {
    const viaWidget: StepSchema & { name: string } = {
      ...transferOk,
      paramSchema: { properties: { recipient: { 'x-ui-widget': 'account-selector' } } },
    };
    expect(findUnannotatedRecipients([viaWidget])).toEqual([]);
  });

  it('ignoriert Nicht-Adress-Felder und Nicht-Empfänger-Namen', () => {
    const noRecipient: StepSchema & { name: string } = {
      name: 'Interval',
      abiFragment: { type: 'tuple', components: [{ name: 'interval', type: 'uint256' }] },
      paramSchema: { properties: {} },
    };
    expect(findUnannotatedRecipients([noRecipient])).toEqual([]);
  });
});
