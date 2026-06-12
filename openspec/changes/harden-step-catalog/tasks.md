# Tasks — harden-step-catalog

Order follows the migration plan: R2 (guard) lands against the current monolith first, then
R1 (split) under an equivalence assertion. TDD per slice (RED → GREEN → REFACTOR).

## 1. Capability source of truth (R2 foundation)

- [ ] 1.1 Add `action-capabilities.ts` (backend `src/catalog/`) declaring, per action, the
      supported `AmountMode`s and which modes require which auxiliary field/role; doc-comment
      links to `contracts/libraries/ActionLib.sol` (mirror, not parse — D1).
- [ ] 1.2 Unit-test the source: every Aave action lists FIXED/FROM_SLOT/MAX_AVAILABLE/TARGET_HF
      consistent with `ActionLib.AmountMode`; TARGET_HF maps to the `health-factor` field/role.

## 2. Integrity guard — pure function + tests (R2 core, TDD)

- [ ] 2.1 RED: write `checkCatalogIntegrity(catalog, capabilities) → Violation[]` tests with
      crafted-bad fixtures — anchor case: a Borrow entry advertising TARGET_HF whose field says
      "not yet available" MUST produce a violation (reproduces the shipped bug).
- [ ] 2.2 GREEN: implement the rule "advertised `x-ui-modes` ⊆ supported modes" (per StepType).
- [ ] 2.3 GREEN: rule "mode-dependent field present when offered" (e.g. TARGET_HF ⇒ a
      `health-factor` `targetHealthFactor` field exists).
- [ ] 2.4 GREEN: rule "no stale availability phrases (`not yet available`/`reserved`/`later
      slice`, configurable) on a field whose mode/role is actually offered".
- [ ] 2.5 GREEN: rule "ABI ↔ schema lockstep" — every `abiFragment` component maps to a
      `paramSchema` property (or `x-ui-hidden`), and every non-hidden property maps to a
      component; both directions reported.
- [ ] 2.6 GREEN: rule "money-target fields resolve to a role" via `resolveFieldRole` /
      `findUnannotatedRecipients` from `shared/step-roles` (reuse, do not reimplement — D3).
- [ ] 2.7 REFACTOR: each `Violation` carries `{ step, field, rule, detail }`; collapse shared
      shape; ensure messages name the offending step/field/value.

## 3. Run the guard in CI (R2 wiring)

- [ ] 3.1 Add a backend test that loads the composed catalog and asserts
      `checkCatalogIntegrity(...) === []` (fails `pnpm backend:test` on any drift).
- [ ] 3.2 Confirm it passes GREEN on today's (already-corrected) catalog; verify it would have
      caught the TARGET_HF drift (temporarily reintroduce the stale text in a test, not in seed).

## 4. Catalog de-monolithization (R1, behaviour-neutral)

- [ ] 4.1 Snapshot the current composed catalog (sorted/normalized) as the equivalence fixture
      (D5) — captured BEFORE moving any code.
- [ ] 4.2 Extract per-domain modules under `prisma/seed/catalog/`: `core.ts` (conditions, fee,
      transfer), `aave.ts`, `pancakeswap.ts`, `tokens.ts`, `recipes.ts` — pure move + re-export,
      no value edits.
- [ ] 4.3 Reduce `seed.ts` to a thin orchestrator: import + concatenate the modules, run the
      existing deployed-catalog validation + upserts unchanged.
- [ ] 4.4 Equivalence assertion: composed catalog deep-equals the 4.1 snapshot (no added/removed/
      changed entries). Re-seed locally and confirm identical DB rows.

## 5. Definition of Done

- [ ] 5.1 `pnpm backend:test` green (guard + equivalence); `pnpm --filter shared test` green if
      helpers were touched.
- [ ] 5.2 `openspec validate harden-step-catalog --strict` passes.
- [ ] 5.3 Re-seed (`pnpm db:seed`) produces the identical catalog; MCP `describe_step_type` and
      the editor render unchanged (spot-check Aave Borrow TARGET_HF).
- [ ] 5.4 Code-review without open hard blockers.
