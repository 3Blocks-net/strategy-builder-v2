# Protocol-adapter conformance suite (Story-4 capstone)

## Parent PRD

vault-cockpit-prd.md

## What to build

The Story-4 guard rail: a shared conformance test suite that **every** `ProtocolAdapter`
implementation must pass, so a future protocol's adapter is written against an explicit
contract and automatically flows into positions, snapshots, and PnL without re-designing
those views. Both shipped adapters (Aave V3, PancakeSwap V3) are run through it as the two
proofs that the extension path works.

- A reusable conformance harness asserting the `ProtocolAdapter` contract:
  - `getPositions` returns well-formed `ValuedPosition`s (required fields; USD present or
    explicitly null; debt legs carry `debtUsd` with the correct sign convention so equity
    nets correctly).
  - `claimedTokens` returns the protocol's owned token addresses (non-empty for both
    adapters) and those tokens are excluded from idle by `ValuationService`.
  - `logSubscriptions` (where present) returns the documented `{address, topics,
    vaultTopicIndex}` shape.
- Both `AaveV3Adapter` and `PancakeV3Adapter` are subscribed to the suite.
- A short "how to add a new protocol adapter" note pointing at the suite as the contract
  (satisfies the epic's maintainability mitigation / Story 4 documented adapter guide).

See PRD _Modules → ProtocolAdapter_, _Testing Decisions → ProtocolAdapter conformance suite_.

## Acceptance criteria

- [ ] A shared, parameterized conformance suite exists; adding an adapter to it is a one-liner.
- [ ] `AaveV3Adapter` and `PancakeV3Adapter` both pass the full suite (incl. `claimedTokens`
      and, where applicable, `logSubscriptions`).
- [ ] The suite asserts the `ValuedPosition` contract and the debt sign convention such that a
      non-conforming future adapter fails clearly.
- [ ] A brief "adding a new protocol adapter" doc references the suite as the contract.

## Blocked by

- Blocked by `02-aave-positions-adapter.md` (slice #2)
- Blocked by `03-pancakeswap-lp-adapter.md` (slice #3)
- Blocked by `08-aave-earnings-protocolflow.md` (slice #8)

## User stories addressed

- User story 30
- User story 31
- User story 32
