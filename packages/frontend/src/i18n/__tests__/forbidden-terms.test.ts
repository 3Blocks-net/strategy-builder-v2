import { describe, expect, it } from 'vitest';
import { catalogEntries, findForbiddenTerms } from '../forbidden-terms';
import { de } from '../locales/de';
import { en } from '../locales/en';

const german = [...catalogEntries(de)];

describe('German catalog', () => {
  it('has entries to check at all', () => {
    // Guards the guard: an empty walk would make every assertion below pass.
    expect(german.length).toBeGreaterThan(100);
  });

  it('never invents a German word for a finance term', () => {
    const offenders = german
      .map(([key, value]) => [key, findForbiddenTerms(value)] as const)
      .filter(([, hits]) => hits.length > 0)
      .map(([key, hits]) => `${key}: ${hits.join(', ')}`);

    expect(offenders).toEqual([]);
  });

  it('keeps the established terms English in German copy', () => {
    expect(de.dashboard?.heading).toBe('Deine Vaults');
    expect(de.vaultCreate?.feeStep?.depositFee).toBe('Deposit Fee');
    expect(de.vaultCreate?.feeStep?.withdrawFee).toBe('Withdraw Fee');
    expect(de.positions?.metrics?.healthFactor).toContain('Health Factor');
    expect(de.discovery?.markets?.kind?.liquidityPool).toBe('Liquidity Pool');
    expect(de.performance?.pnl).toBe('PnL');
  });

  it('translates every key the English source carries', () => {
    const englishKeys = [...catalogEntries(en)].map(([key]) => key);
    const germanKeys = new Set(german.map(([key]) => key));
    expect(englishKeys.filter((key) => !germanKeys.has(key))).toEqual([]);
  });
});

describe('the guard itself', () => {
  it('catches an invented term at the start of a compound', () => {
    expect(findForbiddenTerms('Die Tauschgebühr beträgt 1 %')).toEqual(['Tausch']);
    expect(findForbiddenTerms('Deine Tresore')).toEqual(['Tresor']);
  });

  it('leaves an ordinary word alone that merely ends like one', () => {
    expect(findForbiddenTerms('Reger Austausch mit dem Team')).toEqual([]);
  });
});
