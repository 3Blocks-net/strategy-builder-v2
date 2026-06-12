import { checkCatalogIntegrity, type CatalogEntry } from './catalog-integrity';
import { AmountMode, type ActionCapability } from './action-capabilities';
import { STEP_TYPE_CATALOG } from '../../prisma/seed/step-types';

/** A well-formed Aave-amount-mode entry; tweak per test to break one rule. */
function aaveEntry(over: Partial<{
  modes: number[];
  hfDescription: string;
  hfWidget: string;
  hfHidden: boolean;
  includeHfField: boolean;
}> = {}): CatalogEntry {
  const {
    modes = [0, 1, 2, 3],
    hfDescription = 'Target health factor for mode 3 (TARGET_HF), WAD units.',
    hfWidget = 'health-factor',
    hfHidden = true,
    includeHfField = true,
  } = over;
  const properties: Record<string, unknown> = {
    asset: { 'x-ui-widget': 'token-selector' },
    mode: { 'x-ui-widget': 'aave-amount-mode', 'x-ui-modes': modes },
    amount: { 'x-ui-widget': 'token-amount', 'x-ui-hidden': true },
    amountFromSlot: { 'x-ui-widget': 'context-slot', 'x-ui-slot-access': 'read', 'x-ui-hidden': true },
    ...(includeHfField
      ? { targetHealthFactor: { 'x-ui-widget': hfWidget, 'x-ui-hidden': hfHidden, description: hfDescription } }
      : {}),
    amountToSlot: { 'x-ui-widget': 'context-slot', 'x-ui-slot-access': 'write', 'x-ui-hidden': true },
  };
  const components = [
    { name: 'asset', type: 'address' },
    { name: 'mode', type: 'uint8' },
    { name: 'amount', type: 'uint256' },
    { name: 'amountFromSlot', type: 'uint32' },
    ...(includeHfField ? [{ name: 'targetHealthFactor', type: 'uint256' }] : []),
    { name: 'amountToSlot', type: 'uint32' },
  ];
  return {
    name: 'Aave V3 Borrow (fixture)',
    contractKey: 'AaveV3BorrowAction',
    paramSchema: { type: 'object', properties },
    abiFragment: { type: 'tuple', components },
  };
}

describe('checkCatalogIntegrity — rules', () => {
  it('clean entry has no violations', () => {
    expect(checkCatalogIntegrity([aaveEntry()])).toEqual([]);
  });

  it('2.2 advertises an unsupported mode → mode-unsupported', () => {
    const v = checkCatalogIntegrity([aaveEntry({ modes: [0, 1, 2, 3, 5] })]);
    expect(v.map((x) => x.rule)).toContain('mode-unsupported');
    expect(v.find((x) => x.rule === 'mode-unsupported')?.detail).toContain('5');
  });

  it('2.3 advertises TARGET_HF but no health-factor field → mode-field-missing', () => {
    const v = checkCatalogIntegrity([aaveEntry({ includeHfField: false })]);
    expect(v.map((x) => x.rule)).toContain('mode-field-missing');
  });

  // ANCHOR — reproduces the shipped TARGET_HF "not yet available" drift bug.
  it('2.4 offered TARGET_HF field claiming "not yet available" → stale-phrase', () => {
    const v = checkCatalogIntegrity([
      aaveEntry({ hfDescription: 'Reserved for the TARGET_HF mode (not yet available). 1e18 units.' }),
    ]);
    const stale = v.find((x) => x.rule === 'stale-phrase');
    expect(stale).toBeDefined();
    expect(stale?.field).toBe('targetHealthFactor');
  });

  it('2.4 stale text on a genuinely-not-offered hidden field is allowed', () => {
    // TARGET_HF NOT advertised → the hidden hf field is not "offered" → exempt.
    const v = checkCatalogIntegrity([
      aaveEntry({
        modes: [0, 1, 2],
        hfDescription: 'Reserved for the TARGET_HF mode (not yet available).',
      }),
    ]);
    expect(v.map((x) => x.rule)).not.toContain('stale-phrase');
  });

  it('2.4 catches the bare Solidity wording "reserved; reverts…"', () => {
    const v = checkCatalogIntegrity([
      aaveEntry({ hfDescription: 'reserved; reverts until the HF/oracle slice ships it.' }),
    ]);
    expect(v.find((x) => x.rule === 'stale-phrase')?.field).toBe('targetHealthFactor');
  });

  it('2.5 abiFragment component without a schema property → abi-schema-drift', () => {
    const e = aaveEntry();
    (e.abiFragment as { components: { name: string; type: string }[] }).components.push({
      name: 'ghost',
      type: 'uint256',
    });
    const v = checkCatalogIntegrity([e]);
    expect(v.find((x) => x.rule === 'abi-schema-drift')?.field).toBe('ghost');
  });

  it('2.5 non-hidden schema property without an abi component → abi-schema-drift', () => {
    const e = aaveEntry();
    (e.paramSchema as { properties: Record<string, unknown> }).properties.extra = {
      'x-ui-widget': 'token-amount',
    };
    const v = checkCatalogIntegrity([e]);
    expect(v.find((x) => x.rule === 'abi-schema-drift')?.field).toBe('extra');
  });

  it('2.5 friendly start-time property without an abi component is exempt', () => {
    const e = aaveEntry();
    (e.paramSchema as { properties: Record<string, unknown> }).properties.startTime = {
      'x-ui-widget': 'start-time',
    };
    expect(checkCatalogIntegrity([e]).map((x) => x.rule)).not.toContain('abi-schema-drift');
  });

  it('2.6 unannotated money-target (address recipient) → unannotated-role', () => {
    const entry: CatalogEntry = {
      name: 'Transfer (fixture)',
      contractKey: 'ERC20TransferAction',
      paramSchema: { type: 'object', properties: { recipient: { 'x-ui-widget': 'account-selector' } } },
      abiFragment: { type: 'tuple', components: [{ name: 'recipient', type: 'address' }] },
    };
    const v = checkCatalogIntegrity([entry]);
    expect(v.map((x) => x.rule)).toContain('unannotated-role');
  });

  it('honours an injected capability set', () => {
    const caps: Record<string, ActionCapability> = {
      AaveV3BorrowAction: { supportedModes: [AmountMode.FIXED] },
    };
    const v = checkCatalogIntegrity([aaveEntry({ modes: [0, 3] })], caps);
    expect(v.find((x) => x.rule === 'mode-unsupported')?.detail).toContain('3');
  });
});

describe('checkCatalogIntegrity — real catalog (CI guard)', () => {
  it('3.1 the seeded catalog is clean', () => {
    expect(checkCatalogIntegrity(STEP_TYPE_CATALOG)).toEqual([]);
  });

  it('3.2 would have caught the TARGET_HF drift', () => {
    const mutated = JSON.parse(JSON.stringify(STEP_TYPE_CATALOG)) as CatalogEntry[];
    const borrow = mutated.find((e) => e.contractKey === 'AaveV3BorrowAction');
    const props = (borrow!.paramSchema as { properties: Record<string, { description?: string }> }).properties;
    props.targetHealthFactor.description = 'Reserved for the TARGET_HF mode (not yet available). 1e18 units.';
    const v = checkCatalogIntegrity(mutated);
    expect(v.find((x) => x.rule === 'stale-phrase')?.step).toContain('Borrow');
  });
});
