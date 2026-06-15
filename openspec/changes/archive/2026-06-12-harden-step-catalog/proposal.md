## Why

The StepType catalog (`packages/backend/prisma/seed.ts`, 1199 lines) is the single
source the MCP and the web editor read to render, validate, and encode automations —
yet its LLM-/UI-facing `paramSchema` text can silently drift from the actual on-chain
action capabilities, with nothing to catch it. That drift already shipped user-visible
bugs three times (Aave `TARGET_HF` advertised as *"not yet available"* while the
contract fully supported it; `x-ui-modes` lists out of sync with `ActionLib.AmountMode`).
The monolith also makes every new action/protocol a large-file edit, which is exactly
where such drift creeps in.

## What Changes

- **R2 — Schema↔Contract integrity guard (new capability):** a deterministic, CI-run
  consistency check that fails the build when the catalog `paramSchema` contradicts the
  on-chain action capabilities. Backed by a single TypeScript source of truth for action
  capabilities that mirrors `ActionLib.AmountMode` (with a link back to the Solidity enum).
  Per StepType it asserts:
  - advertised `x-ui-modes` ⊆ the action's supported modes;
  - role/selector fields exist when a mode that needs them is offered (e.g. a
    `health-factor` `targetHealthFactor` field when `TARGET_HF` is advertised);
  - no stale availability phrases (`not yet available`, `reserved`, `later slice`) in a
    field whose mode/role is actually offered;
  - `abiFragment` components and `paramSchema` properties stay in lockstep (every ABI
    field maps to a schema property or an `x-ui-hidden` field, and vice versa);
  - role annotations resolve via the existing `shared/step-roles` helpers.
- **R1 — Catalog de-monolithization (structural, behaviour-neutral):** split `seed.ts`
  into per-domain catalog modules (`core`, `aave`, `pancakeswap`, `tokens`, `recipes`);
  `seed.ts` becomes a thin orchestrator that composes them and runs the existing
  deployed-catalog validation. Seeded output is identical (asserted by an equivalence test).
- **No behaviour change** to the running MCP, backend API, or contracts. This is a
  test/structure hardening change.

## Capabilities

### New Capabilities
- `step-catalog-integrity`: the catalog is the single source of truth consumed by the MCP
  and editor, and an automated guard keeps its `paramSchema` consistent with on-chain
  action capabilities so stale/contradictory metadata fails CI, not users.

### Modified Capabilities
<!-- None. mcp-step-catalog (MCP serving the catalog) is unchanged at the requirement
     level — this change adds a backend-side integrity guard and a structural refactor,
     neither of which alters MCP behaviour. -->

## Impact

- **Code:** `packages/backend/prisma/seed.ts` (split into `prisma/seed/catalog/*`); new
  capability source-of-truth + guard test (backend Jest or a shared Vitest module);
  optional reuse of `shared/src/step-roles.ts` helpers.
- **CI / scripts:** the guard runs in the existing backend test run (`pnpm backend:test`);
  no new pipeline stage required.
- **No runtime impact:** seed flow, MCP tools, backend endpoints, contracts, deploy
  scripts unchanged. Re-seed produces the identical catalog.
- **Risk:** low — additive test + behaviour-neutral refactor guarded by an
  equivalence assertion.
