## ADDED Requirements

### Requirement: Deposit-token-centric entry recipe

The system SHALL provide an Entry recipe that builds the initial position **from the vault's deposit
token**: an on-chain sizing step swaps the right portion of the deposit token into the pool's other
token at execution time, then mints a concentrated position centered on the current price. One LP leg
is always the deposit token; the other is acquired by the swap. The sizing MUST be computed on-chain
at execution (not baked in at build time), because the automation runs at a keeper-chosen time.

#### Scenario: Entry assembles swap-to-ratio then mint
- **WHEN** the Entry recipe is instantiated for a pool whose one token is the vault deposit token
- **THEN** it yields a two-step automation: `SwapToRangeRatio` (computes the target ratio from the
  live price and swaps the over-represented token) followed by `Mint(rangeMode 1, full balance)`, and
  the minted position's `tokenId` is written to a context slot

### Requirement: Rebalance recipe re-sizes at execution

The system SHALL provide a Rebalance recipe triggered by the TWAP range-breach condition that harvests
fees, closes the position, re-sizes the freed two-token holdings for the new range at the current price,
and reopens. Fees MUST be collected before the position is decreased. Re-sizing MUST happen on-chain at
execution (the firing price is unknown at build time).

#### Scenario: Rebalance closes and reopens around the new price
- **WHEN** the rebalance trigger fires
- **THEN** the automation runs `Collect` → `Decrease(100%)` → `SwapToRangeRatio` →
  `Mint(rangeMode 1, full balance)`, and the new `tokenId` overwrites the context slot
- **AND** because `Decrease` already bundles its own `collect`, the leading `Collect` harvests the
  accrued fees before the principal is withdrawn; `SwapToRangeRatio` balances the two freed tokens and
  `Mint(full balance)` provides them, leaving a small dust remainder in the vault

### Requirement: Auto-compound recipe (mandatory part of the strategy)

The system SHALL provide an Auto-Compound recipe that periodically reinvests earned fees back into
the open position and tops the vault's gas-compensation reserve back up to its minimum, reusing
existing actions only. Topping up the reserve in the same automation keeps the public automations
executable without a separate maintenance automation.

#### Scenario: Auto-compound collects, refills gas, and reinvests on an interval
- **WHEN** the configured compound interval elapses
- **THEN** the automation runs `Collect` → `Fee Deposit` → `Increase`: it harvests the fees, the
  `Fee Deposit` action refills the gas reserve to `minFeeDeposit` (no-op when already funded), and
  `Increase` adds the remaining token amounts to the open position

### Requirement: Curated presets for user-set parameters

Each recipe SHALL expose its parameters as user-set, schema-driven values and SHALL offer curated
presets: wait window `W` (Conservative 1h / Balanced 30m / Aggressive 10m), range width `tickDelta`
(Narrow / Medium / Wide), and rebalance cooldown (7d / 3d / 1d). No parameter is hard-coded in the
recipe logic.

#### Scenario: A preset fills the strategy parameters
- **WHEN** the user selects a preset (e.g. Balanced / Medium / 3d)
- **THEN** the corresponding `W`, `tickDelta`, and cooldown values populate the recipe parameters,
  and the user may still override any of them

### Requirement: On-chain execution-time sizing

The token-ratio sizing SHALL be computed **on-chain at execution** by the `SwapToRangeRatio` action
from the live pool price, because the automation fires at a keeper-chosen time when a build-time
amount would be stale. The off-chain `lp-math.depositSwapFraction` helper MAY be used for a frontend
preview only, never as the executed swap amount.

#### Scenario: Sizing is computed at execution, not baked in
- **WHEN** a Rebalance automation fires at a price different from when it was built
- **THEN** `SwapToRangeRatio` reads the current price and swaps to the target ratio for that price —
  the executed amount is not a value fixed at build time

### Requirement: Recipes validate against the deployed catalog

The three recipe shapes SHALL reference only deployed StepTypes with valid parameter keys, so the
existing seed-time recipe validation accepts them.

#### Scenario: Recipes pass seed validation
- **WHEN** the recipes are seeded
- **THEN** `validateRecipeShape` accepts each (known step names, valid param keys) and they are
  delivered to the catalog
