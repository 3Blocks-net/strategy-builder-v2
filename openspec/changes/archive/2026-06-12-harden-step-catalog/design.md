## Context

`packages/backend/prisma/seed.ts` (1199 lines) is the StepType/Recipe/token catalog. It is
seeded into Postgres and exposed via `/step-types` (+ `/step-types/:id`), which the MCP
(`describe_step_type`) and the web editor (`dynamic-form`) consume verbatim — the
`paramSchema` `description`/`title` text is literally what the LLM and the user see. The
whole stack downstream of the catalog is schema-driven (encode-boundary, validation,
role-resolution, MCP, frontend) with no per-step-type branching, so the catalog *is* the
contract.

The weak spot is the boundary between that catalog and the on-chain actions: nothing checks
that the advertised `paramSchema` matches what the deployed action actually does. This drift
shipped three times around Aave `TARGET_HF` (advertised "not yet available" while
`AaveV3BorrowAction._targetHfBorrow` + `ActionLib.AmountMode.TARGET_HF` were live; `x-ui-modes`
listing modes the prose contradicted). The seed monolith makes these edits error-prone and
hard to review per protocol.

Constraints: behaviour-neutral (no change to seeded values, MCP, API, contracts); the guard
must be deterministic and run in the existing `pnpm backend:test` (Jest) without new infra;
reuse existing `shared/src/step-roles.ts` and `shared/src/validation.ts` helpers rather than
duplicating role/schema logic.

## Goals / Non-Goals

**Goals:**
- A deterministic guard that fails CI when catalog `paramSchema` contradicts on-chain action
  capabilities (modes, mode-dependent fields, stale availability text, ABI↔schema lockstep,
  role annotations).
- A single TypeScript source of truth for action capabilities that mirrors
  `ActionLib.AmountMode`, so "what modes does this action support" lives in one reviewable place.
- Split the catalog into per-domain modules with a thin orchestrator, proven byte-equivalent.

**Non-Goals:**
- No change to seeded catalog values, MCP tools, backend endpoints, deploy scripts, or
  Solidity (beyond comments already corrected).
- No automated parsing of `.sol` to derive capabilities (brittle); the TS source of truth is
  hand-maintained and linked to the enum by comment.
- Not addressing R3–R6 (frontend god-file, cross-package constants, adapter factory, MCP
  index split) — those are documented in the refactor backlog, out of scope here.

## Decisions

### D1 — Capability source of truth in TS, mirrored from the enum (not parsed)
A small module (e.g. `packages/backend/src/catalog/action-capabilities.ts`, or in `shared`
if the frontend later needs it) declares, per action, the supported `AmountMode`s and which
modes require which auxiliary field/role. It carries a doc-comment pointing at
`contracts/libraries/ActionLib.sol`. **Alternative considered:** parse the Solidity enum at
test time — rejected as brittle (ABI/AST coupling) for a value set that changes rarely and is
security-sensitive enough to want an explicit, reviewed list.

### D2 — Guard as a pure function + a test, over a runtime startup check
The guard is a pure function `checkCatalogIntegrity(catalog, capabilities) → Violation[]`
driven by a Jest test over the composed catalog. **Why:** deterministic, fast, fails the
build, and unit-testable with crafted-bad fixtures (RED→GREEN on the TARGET_HF case). A
runtime warning at seed time (like the existing `validateRuntimeConfig`) is weaker — it does
not block release and is easy to ignore. We may *additionally* surface a seed-time warning,
but CI failure is the contract.

### D3 — Reuse shared helpers for roles/schema, don't reimplement
Role checks use `resolveFieldRole` / `findUnannotatedRecipients` from `shared/step-roles`;
schema shape uses the `ParamSchema`/`AbiFragment` types from `shared`. The guard adds only the
*cross-check* logic (modes ⊆ capabilities; mode→field presence; stale-phrase scan; ABI↔schema
lockstep). Keeps the encode-boundary as the one role/schema authority.

### D4 — Catalog split shape: per-domain arrays composed by a thin seed
`prisma/seed/catalog/{core,aave,pancakeswap}.ts` each export a `StepTypeDef[]`;
`prisma/seed/catalog/{tokens,recipes}.ts` likewise. `seed.ts` imports and concatenates them,
then runs the existing deployed-catalog validation + upserts unchanged. **Alternative:** a
data-driven JSON catalog — rejected; the schemas use TS typing/constants and inline rationale
that JSON would lose. The split is mechanical move + re-export, no value edits.

### D5 — Equivalence proof for the behaviour-neutral refactor
Before the split, capture the composed catalog (sorted, normalized) as a fixture/snapshot;
after the split, assert deep-equality. Guards against an accidental dropped/edited field
during the move. The snapshot is removed or kept as a regression anchor at the team's choice.

## Risks / Trade-offs

- **[Capability source drifts from the contract instead of the schema]** → The single TS list
  is small, reviewed, and comment-linked to `ActionLib.AmountMode`; a contract change touching
  modes is a deliberate, rare event that already requires a redeploy + seed update, at which
  point the list is the obvious co-edit. Net: one reviewed list beats N scattered descriptions.
- **[Stale-phrase scan is heuristic]** → It only fails when the phrase co-occurs with an
  *offered* mode/role, so legitimately-deferred fields are allowed; the phrase list is
  configurable and asserted by its own test.
- **[Split introduces a silent value change]** → D5 equivalence assertion blocks merge if any
  seeded value differs.
- **[Guard false-positive blocks an intentional catalog state]** → Each rule reports the exact
  step/field; rules are individually testable and a genuinely-not-offered field is explicitly
  exempt from the stale-phrase and mode-field rules.

## Migration Plan

1. Land R2 first against the *current* monolith (guard test + capability source) — it passes
   on today's (already-corrected) catalog and would have caught the TARGET_HF drift.
2. Then R1 (split) with the D5 equivalence assertion green.
3. No deploy/runtime migration: seed output is identical; no DB migration; rollback = revert
   the commits (no data change).

## Open Questions

- Does the capability source belong in `backend/src/catalog` or in `shared` (if the frontend
  should later assert the same invariant)? Default: `backend` now, promote to `shared` only if
  a second consumer appears.
- Keep the D5 equivalence snapshot as a permanent regression test, or delete it after the
  split lands? Default: keep, it is cheap and anchors future catalog edits.
