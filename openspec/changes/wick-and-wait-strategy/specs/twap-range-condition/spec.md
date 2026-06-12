## ADDED Requirements

### Requirement: TWAP-confirmed range-breach trigger

The system SHALL provide an on-chain `IUpdatableCondition` (`WickWaitRebalanceCondition`) that
returns met only when the pool's **time-weighted average tick** over a configured window `W` lies
outside the open position's tick range. The condition SHALL read the TWAP via the pool's
`observe([W, 0])` and the position's `tickLower`/`tickUpper` via the position manager's
`positions(tokenId)`, where `tokenId` is read from a context slot.

#### Scenario: Persistent move outside the range fires
- **WHEN** the TWAP tick over window `W` is below `tickLower` or at/above `tickUpper`
- **AND** the cooldown has elapsed
- **THEN** `check()` returns `true`

#### Scenario: Price inside the range does not fire
- **WHEN** the TWAP tick over window `W` is within `[tickLower, tickUpper)`
- **THEN** `check()` returns `false`

### Requirement: Wick robustness

A short price spike that reverts within the window `W` SHALL NOT, by itself, move the TWAP tick
outside the range, so the condition does not fire on a transient wick.

#### Scenario: A brief wick out and back does not fire
- **WHEN** the spot price leaves the range only briefly and returns well within `W`
- **THEN** the TWAP tick over `W` remains inside the range and `check()` returns `false`

### Requirement: Cooldown between rebalances

The condition SHALL NOT fire again until at least `cooldown` seconds have elapsed since the last
firing. The last-firing timestamp SHALL be persisted via `afterExecution`, which the vault calls
only when the trigger fired.

#### Scenario: Cooldown blocks an immediate re-fire
- **WHEN** the TWAP tick is outside the range but fewer than `cooldown` seconds have passed since
  the previous firing
- **THEN** `check()` returns `false`

#### Scenario: First run is not blocked
- **WHEN** the last-rebalance slot is unset (zero) and the TWAP tick is outside the range
- **THEN** `check()` returns `true` (no prior firing to cool down from)

#### Scenario: afterExecution records the firing time
- **WHEN** the vault calls `afterExecution` after a successful rebalance execution
- **THEN** it returns a slot diff setting the last-rebalance slot to the current block timestamp

### Requirement: Pool TWAP read interface

The pool read interface SHALL expose `observe(uint32[] secondsAgos)` so conditions can compute a
TWAP tick. The condition SHALL derive the pool from the position's `token0`/`token1`/`fee` (a single
source of truth) rather than taking a separately-supplied pool address.

#### Scenario: TWAP computed from cumulative ticks
- **WHEN** `observe([W, 0])` returns `tickCumulatives`
- **THEN** the mean tick is `(tickCumulatives[1] − tickCumulatives[0]) / W`, rounded toward negative
  infinity for negative results

### Requirement: Insufficient observation cardinality surfaces clearly

The condition SHALL propagate the underlying `observe` revert when the pool lacks enough observation
history for window `W`, and MUST NOT silently treat insufficient history as "in range" — that would
make a misconfigured strategy never fire instead of failing visibly.

#### Scenario: observe reverts on insufficient cardinality
- **WHEN** the pool's observation cardinality does not cover window `W`
- **THEN** `check()` reverts (does not return a false negative)

### Requirement: Schema-driven catalog entry

The new condition SHALL be seeded into the StepType catalog with a `paramSchema`, `abiFragment`,
and `x-ui` role annotations consistent with the existing schema-driven conventions, so the
frontend, MCP, and the encode-boundary consume it without per-step-type code, and the
`step-catalog-integrity` guard passes.

#### Scenario: Catalog entry passes the integrity guard
- **WHEN** the condition's catalog entry is added and seeded
- **THEN** `checkCatalogIntegrity` reports no violations for it (ABI↔schema lockstep, role
  resolution, no stale phrases)
