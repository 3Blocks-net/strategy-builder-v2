import { describe, it, expect } from 'vitest';
import { validateRuntimeConfig } from './config-validation.js';

const catalog = new Set(['ERC-20 Transfer', 'PancakeSwap V3 Swap']);

describe('validateRuntimeConfig', () => {
  it('saubere Config → keine Warnungen', () => {
    const w = validateRuntimeConfig(
      { enabledSensitiveSteps: new Set(['ERC-20 Transfer']), addressAllowlist: new Set(['0x1111111111111111111111111111111111111111']) },
      catalog,
    );
    expect(w).toEqual([]);
  });

  it('unbekannter sensibler Step-Name (Tippfehler/Case) → Warnung', () => {
    const w = validateRuntimeConfig(
      { enabledSensitiveSteps: new Set(['erc-20 transfer']), addressAllowlist: new Set() },
      catalog,
    );
    expect(w.join(' ')).toMatch(/erc-20 transfer/);
  });

  it('ungültige Allowlist-Adresse → Warnung', () => {
    const w = validateRuntimeConfig(
      { enabledSensitiveSteps: new Set(), addressAllowlist: new Set(['nicht-eine-adresse']) },
      catalog,
    );
    expect(w.join(' ')).toMatch(/Adresse|nicht-eine-adresse/i);
  });
});
