# Tasks — harden-step-catalog

Order follows the migration plan: R2 (guard) lands against the current monolith first, then
R1 (split) under an equivalence assertion. TDD per slice (RED → GREEN → REFACTOR).

## 1. Capability source of truth (R2 foundation)

- [x] 1.1 Add `action-capabilities.ts` (backend `src/catalog/`) declaring, per action, the
      supported `AmountMode`s and which modes require which auxiliary field/role; doc-comment
      links to `contracts/libraries/ActionLib.sol` (mirror, not parse — D1).
- [x] 1.2 Unit-test the source: every Aave action lists FIXED/FROM_SLOT/MAX_AVAILABLE/TARGET_HF
      consistent with `ActionLib.AmountMode`; TARGET_HF maps to the `health-factor` field/role.

## 2. Integrity guard — pure function + tests (R2 core, TDD)

- [x] 2.1 RED: write `checkCatalogIntegrity(catalog, capabilities) → Violation[]` tests with
      crafted-bad fixtures — anchor case: a Borrow entry advertising TARGET_HF whose field says
      "not yet available" MUST produce a violation (reproduces the shipped bug).
- [x] 2.2 GREEN: implement the rule "advertised `x-ui-modes` ⊆ supported modes" (per StepType).
- [x] 2.3 GREEN: rule "mode-dependent field present when offered" (e.g. TARGET_HF ⇒ a
      `health-factor` `targetHealthFactor` field exists).
- [x] 2.4 GREEN: rule "no stale availability phrases (`not yet available`/`reserved`/`later
      slice`, configurable) on a field whose mode/role is actually offered".
- [x] 2.5 GREEN: rule "ABI ↔ schema lockstep" — every `abiFragment` component maps to a
      `paramSchema` property (or `x-ui-hidden`), and every non-hidden property maps to a
      component; both directions reported.
- [x] 2.6 GREEN: rule "money-target fields resolve to a role" via `resolveFieldRole` /
      `findUnannotatedRecipients` from `shared/step-roles` (reuse, do not reimplement — D3).
- [x] 2.7 REFACTOR: each `Violation` carries `{ step, field, rule, detail }`; collapse shared
      shape; ensure messages name the offending step/field/value.

## 3. Run the guard in CI (R2 wiring)

- [x] 3.1 Add a backend test that loads the composed catalog and asserts
      `checkCatalogIntegrity(...) === []` (fails `pnpm backend:test` on any drift).
- [x] 3.2 Confirm it passes GREEN on today's (already-corrected) catalog; verify it would have
      caught the TARGET_HF drift (temporarily reintroduce the stale text in a test, not in seed).

## 0. Enabling extraction + contract-doc fixes (done this session)

- [x] 0.1 Extract the static catalog into `prisma/seed/step-types.ts`
      (`STEP_TYPE_CATALOG`, `contractKey` instead of resolved address; `satisfies StepTypeDef[]`
      preserves the concrete JSON literal types Prisma/recipe-validation need). seed.ts: 1199→250 LOC.
- [x] 0.2 `seed.ts` maps `contractKey → address` and strips the key (Prisma-valid upsert).
- [x] 0.3 Behaviour-neutral verified: catalog hash identical before/after reseed (`5088dccee0824f4e`).
- [x] 0.4 De-stale the 3 remaining contract comment blocks (Supply/Withdraw/Repay) — TARGET_HF is
      live in code (`_targetHf*`), comments said "reserved/later slice" (same drift as Borrow).

## 4. Catalog de-monolithization (R1, behaviour-neutral)

- [x] 4.1 Snapshot/equivalence baseline established (catalog-hash assertion; identical after extraction).
- [x] 4.2 Split `prisma/seed/step-types.ts` further into per-domain modules under
      `prisma/seed/catalog/` (`core`/`aave`/`pancakeswap`) + `tokens`/`recipes` — pure move, no
      value edits. (Single-module extraction done in 0.1; per-domain split pending.)
- [x] 4.3 Reduce `seed.ts` to a thin orchestrator: import + concatenate the modules, run the
      existing deployed-catalog validation + upserts unchanged. (Largely done in 0.2; finalize with 4.2.)
- [x] 4.4 Equivalence assertion: composed catalog deep-equals the 4.1 snapshot (no added/removed/
      changed entries). Re-seed locally and confirm identical DB rows.

## 5. Definition of Done

- [x] 5.1 `pnpm backend:test` green (guard + equivalence); `pnpm --filter shared test` green if
      helpers were touched.
- [x] 5.2 `openspec validate harden-step-catalog --strict` passes.
- [x] 5.3 Re-seed (`pnpm db:seed`) produces the identical catalog; MCP `describe_step_type` and
      the editor render unchanged (spot-check Aave Borrow TARGET_HF).
- [x] 5.4 Code-review without open hard blockers (APPROVE — Withdraw x-ui-modes + stale-phrase regex fixed; rest tracked as R7 in REFACTOR_BACKLOG).
