## 🔍 Code Review — refactor/harden-step-catalog → develop
**2026-06-12 | medium PR | TS monorepo (NestJS+Prisma/Jest · shared/Vitest · Solidity)**

**Diff:** 20 files (+1889/−995); 14 code files (6 docs excluded) | **Fallow:** ✗ not installed (no deterministic baseline)
**Reviewer-Pipeline:** 1× code-explorer → 4× reviewer (code · completeness · test-coverage · architecture) → 0× extended-reasoner (no criticals)

Base is `develop` (the branch's fork point), not `main` — diffing against `main` would pull in all unrelated develop history.

---

### 🔴 Critical (PR-specific)
None.

### 🟡 Warnings (PR-specific)

**Active (high confidence):**

**1. `Aave V3 Withdraw` is missing `x-ui-modes` → the guard is blind to Withdraw drift**
- **File:** `packages/backend/prisma/seed/catalog/aave.ts` (Withdraw `mode` field) · guard logic `src/catalog/catalog-integrity.ts:84-88`
- **Flagged by:** code-reviewer + architecture-reviewer (independently)
- **Verified:** seeded catalog — Supply/Borrow/Repay carry `x-ui-modes: [0,1,2,3]`; **Withdraw has none**.
- **Issue:** the guard derives `advertised = props[modeField]['x-ui-modes'] ?? []`. With no `x-ui-modes`, `advertised = []`, so rules 2.2 (mode-unsupported), 2.3 (mode-field-missing) and 2.4 (stale-phrase on offered mode fields) **silently skip Withdraw** — the exact TARGET_HF drift the PR was built to catch would go uncaught on this one step. The real-catalog CI test (3.1) passes today, giving false assurance.
- **Fix:** add the missing line (matches the other three Aave actions):
  ```ts
  // catalog/aave.ts — Aave V3 Withdraw, mode field
  'x-ui-modes': [0, 1, 2, 3],
  ```
- **Caveat:** this *changes* the served catalog (no longer byte-identical), so it is a real data fix — re-verify the frontend `aave-amount-mode` render (dynamic-form.tsx:564 reads `x-ui-modes`) and capture the new hash. Pre-existing in the old monolith; R1 faithfully copied it.

**2. `STALE_PHRASES` under-matches the spec's "reserved"**
- **File:** `packages/backend/src/catalog/catalog-integrity.ts:39`
- **Issue:** impl uses `/reserved for/i`, but the spec + tasks promise the bare word `reserved`. The actual historical Solidity wording — `"reserved; reverts until the HF/oracle slice ships it"` — would **not** match `/reserved for/i`, so a future field copying that phrasing slips through.
- **Fix:**
  ```ts
  const STALE_PHRASES = [/not yet available/i, /later slice/i, /\breserved\b/i];
  ```
  (`\b` avoids false hits like "unreserved".)

### 🔵 Info / Minor (PR-specific)

- **`unknown` types on `StepTypeDef.paramSchema`/`abiFragment` force a cast** (`catalog-integrity.ts:165` `as Parameters<typeof findUnannotatedRecipients>[0]`). Typing them with shared `ParamSchema`/`AbiFragment` in `_shared.ts` would delete the cast and make `satisfies StepTypeDef[]` structurally enforce the shared shape. Non-blocking. *(dormant)*
- **`satisfies` without `as const`** in the three domain arrays — string literals widen to `string`. Harmless for Prisma `InputJsonValue`; only matters if a future consumer type-matches on `contractKey` literals.
- **`tokens.ts` 6-token overlap** between `PANCAKESWAP_BSC_TOKENS` and `AAVE_BSC_TOKENS` — **confirmed intentional** (separate `ProtocolToken` namespaces), not a DRY violation. Larger address-consolidation already tracked as R4 in REFACTOR_BACKLOG.

### ✅ Completeness
Clean — no debug code, no TODO/FIXME, no `@ts-ignore`/`eslint-disable`, no commented-out blocks, no unused exports (every new export is imported).

### 🧪 Missing Tests
- **No committed equivalence test for the behaviour-neutral refactor.** Task 4.4 is checked but the proof is a *manual* hash (`5088dccee0824f4e`), not a CI-gated assertion. A future typo/dropped field during a catalog edit would pass CI. Recommend a small snapshot/equivalence test (or at least document 4.4 as manual).
- **Guard edge cases untested:** null/empty `abiFragment` or `paramSchema`; a step that has an `ACTION_CAPABILITIES` entry but no `aave-amount-mode` field (should skip mode rules, still run ABI/role rules); a no-capability step (ERC20Transfer) confirming ABI/role rules still apply; the `?? zero-address` fallback in `seed.ts`.

---

### 📐 Architectural Observations (mostly dormant — track as tech-debt)

1. **`AMOUNT_MODE_WIDGET = 'aave-amount-mode'` is a single hardcoded string** (`catalog-integrity.ts:48`). A future protocol with a different mode widget → the guard skips all mode rules for it. Generalize to a `MODE_SELECTOR_WIDGETS` set when the second one appears. *(dormant)*
2. **`FRIENDLY_WIDGETS = {'start-time'}` manually mirrors `shared/encode-boundary.ts:156`** with no compile-time link — adding a friendly widget there without updating the guard yields false-positive `abi-schema-drift` CI failures. Slightly ironic given the PR's anti-drift theme. Add a guard test asserting the set, or export it from `shared`. *(dormant)*
3. **`ACTION_CAPABILITIES` contractKey strings aren't compile-linked** to the catalog `contractKey` values (`action-capabilities.ts:55`) — a rename silently severs the capability lookup. Design (D1) accepts the Solidity-mirror trade-off; the TS↔TS link could be tightened with exported key constants. *(dormant, medium confidence)*
4. **`src/catalog/catalog-integrity.spec.ts` imports `../../prisma/seed/step-types`** — a `src/` test reaching into `prisma/`. Documented trade-off (design D2/D4), narrow blast radius (one test file, no runtime `src/→prisma/` import — verified). A tsconfig path alias would make the path stable if the catalog is ever promoted to `shared`. *(pr-specific, acceptable)*

---

## Merge-Verdict

**APPROVE** — 0 Critical. Behaviour-neutral refactor is sound (contractKey stripped correctly before upsert, zero-address fallback safe, catalog hash verified identical); the guard works for every entry that carries `x-ui-modes`; completeness clean.

### Strongly Recommended (fix before merge — both cheap, both strengthen R2)
- **Withdraw `x-ui-modes: [0,1,2,3]`** — closes the one blind spot in the very guard this PR adds (re-verify frontend + new hash, since it changes catalog data).
- **`STALE_PHRASES` → `/\breserved\b/i`** — align with the spec; catch the real Solidity wording.

### Acceptable to Defer (follow-up / REFACTOR_BACKLOG)
- Committed equivalence test for the refactor; guard edge-case tests.
- Generalize `AMOUNT_MODE_WIDGET` → set; link `FRIENDLY_WIDGETS` to encode-boundary; compile-link `ACTION_CAPABILITIES` keys; type `StepTypeDef` schema fields (drop the cast); tsconfig alias for the seed import.

### Empfohlene Reihenfolge (Dev)
1. Add `x-ui-modes` to Withdraw → reseed → confirm guard still green + new catalog hash + frontend render.
2. Widen `STALE_PHRASES` regex (+ a test asserting it catches `"reserved; reverts…"`).
3. (Optional, this PR or follow-up) commit an equivalence test + the dormant-hardening items.
