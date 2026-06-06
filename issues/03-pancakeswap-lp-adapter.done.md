# PancakeSwap V3 LP positions adapter + LpMath

## Parent PRD

vault-cockpit-prd.md

## What to build

The second protocol adapter. After this slice the positions panel shows each PancakeSwap V3
**LP position** the vault holds: the two underlying token amounts + combined USD value, the
price range with an **in-range / out-of-range** indicator, **live uncollected fees**, and the
pool fee-tier context.

- **`PancakeV3Adapter`** (implements `ProtocolAdapter` from #1):
  - Enumerate the vault's LP NFTs via NPM `ERC721Enumerable` (`balanceOf` +
    `tokenOfOwnerByIndex`), read `positions(tokenId)`.
  - Derive token0/token1 amounts from `liquidity` + `pool.slot0()` via `LpMath`.
  - **Uncollected fees via `collect` static-call** (`from: vault`, `amount*Max =
    uint128.max`) — never the stale `tokensOwed`. See PRD _Resolved decision_ / research §17.2.
  - In-range = `tickLower ≤ tick < tickUpper`. USD = `(amount0+fee0)×price0 +
    (amount1+fee1)×price1` (via `PriceService`). `claimedTokens` = the NPM (NFT manager)
    address. LP earnings = the live uncollected fees (full fee-history accrual is out of
    scope per PRD).
- **`LpMath`** (deep, pure): hand-rolled BigInt `LiquidityAmounts` / `TickMath` (Q96/Q128,
  never `number`). Hard-fixture unit tests in the style of `test/ActionLibHF.ts`.

See PRD _Modules → PancakeV3Adapter, LpMath_.

## Acceptance criteria

- [ ] `LpMath` has isolated hard-fixture unit tests: known `sqrtPriceX96`/tick/`liquidity`
      inputs → exact `(amount0, amount1)`; all math in BigInt (no `number` overflow).
- [ ] Fork integration test: a vault with an LP position minted via the existing PEC-218
      LP-Mint action yields correct token amounts, in-range flag, USD value, and uncollected
      fees read back through the adapter.
- [ ] Uncollected fees come from the `collect` static-call: the call **reverts without
      `from: vault`**, and with it returns the **accrued** fees (not `tokensOwed`) — both
      asserted.
- [ ] An out-of-range position renders as out-of-range; an in-range one as in-range.
- [ ] `claimedTokens` returns the NPM address; LP positions appear grouped under PancakeSwap
      V3 in `PositionsPanel` with range + fees + fee-tier context.
- [ ] A single broken LP position read is isolated (error row) and does not blank the panel.

## Blocked by

- Blocked by `01-cockpit-spine.md` (slice #1)

## User stories addressed

- User story 7
- User story 8
- User story 9
- User story 10
