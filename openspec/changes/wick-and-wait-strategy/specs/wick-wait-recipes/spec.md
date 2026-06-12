## ADDED Requirements

### Requirement: Deposit-token-centric entry recipe

The system SHALL provide an Entry recipe that builds the initial position **from the vault's deposit
token**: swap a fraction of the deposit token into the pool's other token, then mint a concentrated
position centered on the current price. One LP leg is always the deposit token; the other is
acquired by the swap.

#### Scenario: Entry assembles swap then mint
- **WHEN** the Entry recipe is instantiated for a pool whose one token is the vault deposit token
- **THEN** it yields a two-step automation: `Swap(part of deposit → other token)` followed by
  `Mint(rangeMode 1)`, and the minted position's `tokenId` is written to a context slot

### Requirement: Rebalance recipe normalizes to the deposit token

The system SHALL provide a Rebalance recipe triggered by the TWAP range-breach condition that
closes the position, normalizes holdings back to the deposit token, re-sizes for the new range, and
reopens — keeping the deposit token as the base between positions.

#### Scenario: Rebalance closes and reopens around the new price
- **WHEN** the rebalance trigger fires
- **THEN** the automation runs `Decrease(100%)` → `Collect` → `Swap(other → deposit token)` →
  `Swap(part of deposit → other token)` → `Mint(rangeMode 1)`, and the new `tokenId` overwrites the
  context slot

### Requirement: Auto-compound recipe (mandatory part of the strategy)

The system SHALL provide an Auto-Compound recipe that periodically reinvests earned fees back into
the open position, reusing existing actions only.

#### Scenario: Auto-compound collects and reinvests on an interval
- **WHEN** the configured compound interval elapses
- **THEN** the automation runs `Collect` → `Increase`, adding the collected token amounts to the
  open position

### Requirement: Curated presets for user-set parameters

Each recipe SHALL expose its parameters as user-set, schema-driven values and SHALL offer curated
presets: wait window `W` (Conservative 1h / Balanced 30m / Aggressive 10m), range width `tickDelta`
(Narrow / Medium / Wide), and rebalance cooldown (7d / 3d / 1d). No parameter is hard-coded in the
recipe logic.

#### Scenario: A preset fills the strategy parameters
- **WHEN** the user selects a preset (e.g. Balanced / Medium / 3d)
- **THEN** the corresponding `W`, `tickDelta`, and cooldown values populate the recipe parameters,
  and the user may still override any of them

### Requirement: Off-chain single-sided sizing

The swap fraction for the deposit-token-to-other-token sizing SHALL be computed off-chain using the
shared `lp-math` helper and supplied to the automation as a parameter/slot; v1 introduces no
on-chain sizing contract.

#### Scenario: Sizing fraction is supplied, not computed on-chain
- **WHEN** an Entry or Rebalance automation is built
- **THEN** the swap amount/fraction is provided as an input derived off-chain from `lp-math`, and no
  new on-chain action performs the sizing

### Requirement: Recipes validate against the deployed catalog

The three recipe shapes SHALL reference only deployed StepTypes with valid parameter keys, so the
existing seed-time recipe validation accepts them.

#### Scenario: Recipes pass seed validation
- **WHEN** the recipes are seeded
- **THEN** `validateRecipeShape` accepts each (known step names, valid param keys) and they are
  delivered to the catalog
