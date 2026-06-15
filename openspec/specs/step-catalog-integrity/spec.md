# step-catalog-integrity Specification

## Purpose
TBD - created by archiving change harden-step-catalog. Update Purpose after archive.
## Requirements
### Requirement: Catalog is the single consumed source of truth

The StepType catalog seeded into the database SHALL be the only source the MCP and the
web editor read for each step's `paramSchema` and `abiFragment`. No consumer SHALL
hard-code per-step-type or per-protocol metadata that the catalog already carries.

#### Scenario: A new action appears everywhere from one catalog entry
- **WHEN** a StepType is added to the catalog with a valid `paramSchema` and `abiFragment`
- **THEN** it is served by the MCP (`list_step_types` / `describe_step_type`) and rendered
  by the editor without any additional per-step-type code in either consumer

### Requirement: Advertised modes are a subset of on-chain capabilities

A single TypeScript source of truth SHALL declare the supported amount/selection modes of
each action, mirroring the on-chain `ActionLib.AmountMode` enum and referencing it. For
every StepType whose schema advertises selectable modes (`x-ui-modes`), the advertised set
MUST be a subset of that action's supported modes.

#### Scenario: Catalog advertises an unsupported mode
- **WHEN** a StepType's `x-ui-modes` includes a mode value not listed as supported for its
  action in the capability source of truth
- **THEN** the integrity guard fails with the offending step name, field, and mode value

#### Scenario: TARGET_HF is advertised and supported
- **WHEN** an Aave step advertises mode `3` (TARGET_HF) and the capability source marks
  TARGET_HF as supported for that action
- **THEN** the guard passes for that mode

### Requirement: Mode-dependent fields are present when the mode is offered

When a StepType advertises a mode that requires an auxiliary field, the `paramSchema` MUST
contain that field with the expected widget and role (e.g. advertising `TARGET_HF` requires
a `targetHealthFactor` field carrying the `health-factor` widget).

#### Scenario: Advertised TARGET_HF without a health-factor field
- **WHEN** a StepType advertises mode `3` (TARGET_HF) but its schema has no
  `health-factor` field for the target
- **THEN** the guard fails, naming the missing field

### Requirement: No stale availability text on offered fields

A `paramSchema` field whose mode or role is actually offered by the catalog MUST NOT contain
availability-disclaimer phrases (`not yet available`, `reserved`, `later slice`, or
equivalent). Such phrases are only permitted on fields that are genuinely not offered.

#### Scenario: Offered field still claims it is unavailable
- **WHEN** a field's mode/role is advertised but its `description` contains "not yet
  available" (or a configured equivalent phrase)
- **THEN** the guard fails, citing the step, field, and phrase

### Requirement: ABI fragment and schema stay in lockstep

For every StepType, each `abiFragment` component MUST map to a `paramSchema` property (or an
`x-ui-hidden` property), and every non-hidden `paramSchema` property MUST map to an
`abiFragment` component. Drift in either direction MUST fail the guard.

#### Scenario: ABI component without a schema property
- **WHEN** an `abiFragment` declares a component with no corresponding `paramSchema` property
- **THEN** the guard fails, naming the unmatched component

#### Scenario: Schema property without an ABI component
- **WHEN** a non-hidden `paramSchema` property has no corresponding `abiFragment` component
- **THEN** the guard fails, naming the unmatched property

### Requirement: Role annotations resolve for money-bearing fields

Every StepType field that is an on-chain money target MUST resolve to a role via the shared
`step-roles` helpers (explicit `x-ui-role` or derived `x-ui-widget`). An unannotated
money-target field MUST fail the guard.

#### Scenario: Unannotated recipient field
- **WHEN** a StepType has an on-chain recipient field that resolves to no role
- **THEN** the guard fails, listing the step and field (via `findUnannotatedRecipients`)

### Requirement: The integrity guard runs in CI

The consistency guard SHALL execute as part of the automated backend test run and MUST fail
the build on any violation, so catalog drift is caught before release rather than by users.

#### Scenario: Drift fails the build
- **WHEN** any catalog entry violates a guard rule
- **THEN** `pnpm backend:test` exits non-zero with the violation listed

### Requirement: Catalog composition is behaviour-neutral

The catalog composed from per-domain modules SHALL be identical to the previously seeded
catalog — same set of step types, names, contract keys, selectors, `abiFragment`s, and
`paramSchema`s. The split MUST NOT change any seeded value.

#### Scenario: Re-seed after the split is identical
- **WHEN** the catalog is composed from the per-domain modules and seeded
- **THEN** an equivalence assertion confirms the resulting catalog equals the pre-split
  catalog (no added, removed, or changed entries)

