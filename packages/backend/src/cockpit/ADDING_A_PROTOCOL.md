# Adding a new protocol to the Vault-Cockpit

The cockpit is protocol-agnostic. A new protocol (positions, value-history,
PnL/earnings) is added by writing **one adapter** — the views, snapshot loop,
chart, and performance card don't change. The conformance suite
(`conformance.spec.ts`) is the contract; if your adapter passes it, it flows
everywhere.

## Steps

1. **Implement `ProtocolAdapter`** (`protocol-adapter.ts`) in
   `src/cockpit/<protocol>/`:
   - `getPositions(vault) → ValuedPosition[]` — read + value the vault's
     positions. Keep the pure math/shaping in a separate, unit-tested builder
     (see `aave/aave-positions.ts`, `pancakeswap/lp-position.ts`); the adapter
     just does I/O and calls the builder.
   - `claimedTokens(vault) → string[]` — every token your protocol "owns"
     (receipt tokens, debt tokens, NFT managers). `ValuationService` subtracts
     these from the idle list so nothing is double-counted.
   - *(optional)* `logSubscriptions()` — if you need exact earnings, declare the
     events the indexer should capture into `ProtocolFlow` (see
     `aave/aave-subscriptions.ts`). The indexer ingests them generically.

2. **Register** the adapter in `cockpit.module.ts` (`PROTOCOL_ADAPTERS`
   factory). That's the only wiring change — it now appears in `/positions`,
   snapshots, the chart, and PnL automatically.

3. **Add one line to the conformance fixtures** (`conformance.spec.ts`
   `ADAPTERS` array) with representative builder output. The suite enforces:
   - well-formed `ValuedPosition`s (required fields, USD present or explicit
     null, base-unit string amounts);
   - the **debt sign convention** (a debt leg must net to `valueUsd ≤ 0`, a
     `borrow` carries `debtUsd`);
   - `claimedTokens` non-empty + valid addresses;
   - `logSubscriptions` shape (where present).

## Conventions

- **Net equity**: supply/idle/LP add to `valueUsd`; debt subtracts (negative
  `valueUsd` + `debtUsd`). The vault total = Σ `valueUsd`.
- **USD or null, never a wrong number**: if a price is missing, set the leg /
  position USD to `null` — the position still renders, the total just omits it.
- **BigInt for chain math** (Q96/Q128/RAY); base-unit amounts are decimal
  strings, never floats. Mirror the hard-fixture tests in `aave/aave-math.ts`
  and `pancakeswap/lp-math.ts`.
- **Isolate reads**: one broken position must become an error row, not a failed
  panel.
- **PnL/earnings firewall**: boundary deposits/withdraws live in `VaultEvent`
  (drive PnL net-deposits); protocol flows live in `ProtocolFlow` (drive
  earnings). Never union them.
