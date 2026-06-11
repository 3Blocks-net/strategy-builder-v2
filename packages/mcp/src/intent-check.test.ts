import { describe, it, expect } from 'vitest';
import { crossCheckIntent, type FlatIntent } from './intent-check.js';
import type { DecodedSummary } from './summary-decoder.js';

const TOKEN = '0xAAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa';

const decoded: DecodedSummary = {
  execution: 'public',
  warnings: [],
  steps: [
    { stepType: 'Interval Condition', category: 'CONDITION' },
    { stepType: 'PancakeSwap V3 Swap', category: 'ACTION', token: TOKEN, amount: '50' },
  ],
};

const intent: FlatIntent = {
  execution: 'public',
  trigger: { periodSeconds: 604800 },
  actions: [{ token: TOKEN, amount: '50' }],
};

describe('crossCheckIntent', () => {
  it('passender Intent → ok, keine Diffs', () => {
    const r = crossCheckIntent(intent, decoded, false, { triggerSeconds: 604800 });
    expect(r.ok).toBe(true);
    expect(r.diffs).toEqual([]);
  });

  it('execution-Intent ≠ abgeleitete Topologie → Reject', () => {
    const r = crossCheckIntent({ ...intent, execution: 'owner' }, decoded, false);
    expect(r.ok).toBe(false);
    expect(r.diffs.join(' ')).toMatch(/execution/i);
  });

  it('Betrag-Abweichung (Intent 50 ≠ Graph) → Reject mit Diff', () => {
    const tampered: DecodedSummary = {
      ...decoded,
      steps: [decoded.steps[0], { ...decoded.steps[1], amount: '5000' }],
    };
    const r = crossCheckIntent(intent, tampered, false);
    expect(r.ok).toBe(false);
    expect(r.diffs.join(' ')).toMatch(/Betrag/i);
  });

  it('Token-Abweichung → Reject', () => {
    const r = crossCheckIntent(
      { ...intent, actions: [{ token: '0x9999999999999999999999999999999999999999', amount: '50' }] },
      decoded,
      false,
    );
    expect(r.ok).toBe(false);
    expect(r.diffs.join(' ')).toMatch(/Token/i);
  });

  it('Action-Anzahl ≠ → Reject', () => {
    const r = crossCheckIntent({ ...intent, actions: [] }, decoded, false);
    expect(r.ok).toBe(false);
    expect(r.diffs.join(' ')).toMatch(/Anzahl/i);
  });

  it('Trigger-Periode-Abweichung (wöchentlich vs täglich) → Reject', () => {
    const r = crossCheckIntent(intent, decoded, false, { triggerSeconds: 86400 });
    expect(r.ok).toBe(false);
    expect(r.diffs.join(' ')).toMatch(/Trigger/i);
  });

  it('verzweigter Graph → Warnung (markiert, aber kein Reject wenn sonst passend)', () => {
    const r = crossCheckIntent(intent, decoded, false, { triggerSeconds: 604800, branched: true });
    expect(r.ok).toBe(true);
    expect(r.warnings.join(' ')).toMatch(/verzweigt|cross-check/i);
  });

  it('Decoder-Warnungen (fehlende Annotation) werden durchgereicht', () => {
    const withWarn: DecodedSummary = { ...decoded, warnings: ['ERC-20 Transfer: Empfänger-Feld ohne Rolle'] };
    const r = crossCheckIntent(intent, withWarn, false, { triggerSeconds: 604800 });
    expect(r.warnings.join(' ')).toMatch(/Empfänger/i);
  });
});
