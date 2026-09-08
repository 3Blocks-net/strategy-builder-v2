import {
  describeCurationWarning,
  findCurationWarnings,
  type SeededTarget,
} from '../../prisma/seed/curation';

// What the seed tells the operator about the curated lists. A step type that is
// not curated for its own kind seeds and appears in the editor like any other,
// and only fails later inside the vault with StepTargetNotCurated — so the value
// here is entirely in which cases produce a line and which stay quiet.

const CONDITION_ADDRESS = '0x0000000000000000000000000000000000000001';
const ACTION_ADDRESS = '0x0000000000000000000000000000000000000002';

const condition: SeededTarget = {
  name: 'Timer Condition',
  category: 'CONDITION',
  contractAddress: CONDITION_ADDRESS,
};

const action: SeededTarget = {
  name: 'ERC-20 Transfer',
  category: 'ACTION',
  contractAddress: ACTION_ADDRESS,
};

const fullyCurated = {
  registry: '0x00000000000000000000000000000000000000aa',
  conditions: [CONDITION_ADDRESS],
  actions: [ACTION_ADDRESS],
};

describe('findCurationWarnings', () => {
  it('says nothing when every target is curated for its own kind', () => {
    expect(findCurationWarnings([condition, action], fullyCurated)).toEqual([]);
  });

  it('reports a target missing from its list', () => {
    const warnings = findCurationWarnings([condition, action], {
      ...fullyCurated,
      actions: [],
    });

    expect(warnings).toEqual([
      {
        kind: 'target-uncurated',
        name: 'ERC-20 Transfer',
        category: 'ACTION',
        contractAddress: ACTION_ADDRESS,
      },
    ]);
  });

  // The failure the two lists exist to make impossible: curating a condition as
  // an action would make it a legal delegatecall target. A deploy that got the
  // kind wrong must not read as "all good" here — the vault will refuse it.
  it('a target curated under the wrong kind counts as uncurated', () => {
    const warnings = findCurationWarnings([condition], {
      registry: fullyCurated.registry,
      conditions: [],
      actions: [CONDITION_ADDRESS],
    });

    expect(warnings.map((w) => w.kind)).toEqual(['target-uncurated']);
  });

  it('compares addresses regardless of checksum casing', () => {
    const mixedCase = { ...condition, contractAddress: CONDITION_ADDRESS.toUpperCase() };
    expect(findCurationWarnings([mixedCase], fullyCurated)).toEqual([]);
  });

  it('a deployment without a curation record is reported once, not per target', () => {
    expect(findCurationWarnings([condition, action], null)).toEqual([
      { kind: 'record-missing' },
    ]);
  });

  it('an empty record still reports every target', () => {
    const warnings = findCurationWarnings([condition, action], {
      registry: fullyCurated.registry,
    });
    expect(warnings).toHaveLength(2);
  });
});

describe('describeCurationWarning', () => {
  it('names the step type, its kind and its address', () => {
    const line = describeCurationWarning({
      kind: 'target-uncurated',
      name: 'ERC-20 Transfer',
      category: 'ACTION',
      contractAddress: ACTION_ADDRESS,
    });

    expect(line).toContain('ERC-20 Transfer');
    expect(line).toContain('ACTION');
    expect(line).toContain(ACTION_ADDRESS);
    expect(line).toContain('contracts:deploy:fork');
  });

  it('points a missing record at the deploy that writes it', () => {
    expect(describeCurationWarning({ kind: 'record-missing' })).toContain(
      'contracts:deploy:fork',
    );
  });
});
