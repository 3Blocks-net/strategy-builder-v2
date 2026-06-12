---
name: code-review
description: |
  Multi-agent Code Review Orchestrator. On load: auto-detects tech stack,
  runs Fallow pre-scan if available, then waits for GO. Routes the diff
  through specialised sub-agents (code-explorer, code-reviewer,
  security-reviewer, architecture-reviewer, schema-form-consistency-check,
  cross-reference-check, completeness-check, test-coverage-check), spawns
  one extended-reasoner per critical finding for forensic depth, and
  finishes with an optional PRD/Issue compliance check.
triggers:
  - "code review"
  - "review this PR"
  - "review mein PR"
  - "starte review"
  - "start review"
allowed-tools:
  - Bash
  - Read
  - Agent
  - Write
---

# Code Review Orchestrator

When this skill is loaded, immediately run the Boot Sequence. Do not wait for instructions.

---

## BOOT SEQUENCE

### Step 1 — Environment Check

Run in parallel:

```bash
gh --version 2>/dev/null && echo "GH_AVAILABLE" || echo "GH_NOT_AVAILABLE"
```
```bash
git remote get-url origin 2>/dev/null; git branch --show-current
```
```bash
find . -maxdepth 3 \( -name "ARCHITECTURE.md" -o -name "architecture.md" \) \
  ! -path "*/node_modules/*" ! -path "*/.git/*" 2>/dev/null
```

### Step 1.5 — Fallow Pre-Scan (deterministic baseline)

Determine the base ref to compare against. Default: `main`. Fallback if main is missing: `origin/main`, then `master`, then `origin/master`.

Fallow is part of the workspace devDependencies. The skill assumes `./node_modules/.bin/fallow` exists after `pnpm install` (or the equivalent for the project's package manager). No multi-path detection — if the binary is missing, the user forgot to install dependencies.

Run:

```bash
./node_modules/.bin/fallow audit --changed-since main --format markdown > /tmp/fallow_diff.md 2>/tmp/fallow_err.log
echo "FALLOW_EXIT=$?"
[ -f /tmp/fallow_diff.md ] && wc -l /tmp/fallow_diff.md
```

If `FALLOW_EXIT == 0` and `fallow_diff.md` is non-empty:
- Read the file with the Read tool.
- Split on H2 headers (`## Duplication`, `## Circular Dependencies`, `## Boundaries`, `## Complexity`, `## Unused`, `## Dead Code` — exact section titles depend on Fallow output, parse what you see).
- Store each section as a string in working memory: `fallow.duplication`, `fallow.circulars`, `fallow.boundaries`, `fallow.complexity`, `fallow.unused`.
- Also extract the **top 3-5 complexity hotspots** (file + cyclomatic value) for the header in Step 4.

If `FALLOW_EXIT != 0` and `/tmp/fallow_err.log` contains "No such file or directory":
- Set all `fallow.*` slots to empty string.
- Note in the boot summary: `Fallow: ✗ — './node_modules/.bin/fallow' not found. Did you run the install command for your project's package manager? Fallow is a devDependency.`
- Skill continues without Fallow inputs.

If `FALLOW_EXIT != 0` for other reasons (corrupt repo, missing main ref, etc):
- Set all `fallow.*` slots to empty string.
- Note in the boot summary: `Fallow: ✗ — run failed (see /tmp/fallow_err.log).`
- Skill continues without Fallow inputs.

The full `fallow_diff.md` content stays available in the orchestrator context for the Final Summary.

### Step 2 — Tech Stack Analysis

Use the Agent tool to spawn a code-explorer agent.
Task: "Detect tech stack only. Check package.json, composer.json, requirements.txt,
tsconfig.json, vite.config.*, next.config.*. Scan top 2 levels of src/ or app/.
Return: Language, Framework, UI Library, Test Framework, Key conventions (3-5 points), Folder structure (1 sentence)."

### Step 3 — Boot Summary

Present to user:

```
🚀 Code Review Orchestrator — bereit

Stack: [detected]
Tests: [detected or 'nicht gefunden']
Architecture doc: [path / 'nicht gefunden — wird inferiert']
gh: [verfügbar / nicht verfügbar]
Fallow: [✓ N findings (X dup, Y circ, Z compl) / ✗ nicht gefunden — install ausführen?]

Agents bereit:
  Haiku    → code-explorer, completeness-check, test-coverage-check
  Sonnet   → code-reviewer, security-reviewer, architecture-reviewer,
             schema-form-consistency-check, cross-reference-check,
             extended-reasoner
  Opus 4.6 → prd-reviewer (final PRD/Issue compliance)

Bitte bereitstellen:
1. git diff main...dein-branch
2. PR-Nummer (optional, für gh comment)
3. PRD + Issue Markdown (optional, für finalen Check)
4. Schema-Check-Mode (optional): 'always' oder 'skip' überschreibt Default
   (Default: konditional — läuft automatisch wenn Forms/Schemas/DTOs/Controllers im Diff)

Bereit → GO
```

### Step 4 — Wait

Do NOT proceed until user types GO or provides the materials.

When parsing the user's GO message:
- If it contains `schema-check: always` → set `schema_check_mode = "always"`
- If it contains `schema-check: skip` → set `schema_check_mode = "skip"`
- Otherwise → `schema_check_mode = "auto"` (the default)

---

## REVIEW PHASE

### Step 0 — Universal exclusion list (apply BEFORE everything else)

Before counting changed files, dispatching code-explorer, or routing reviewers, **filter the changed-files list** to remove paths that match any of the following patterns. These are NEVER part of any review and NEVER explored, regardless of diff contents — exploring them is pure token waste because they're machine-generated, vendored, or build output.

**Always-skip patterns (universal):**
```
**/generated/**           # codegen output (Orval, openapi-codegen, prisma client, etc.)
**/__generated__/**       # GraphQL codegen, type-generation conventions
**/api/models/**          # DTO models from REST/OpenAPI generators
**/dist/**                # build output
**/build/**               # build output
**/.next/**               # Next.js build cache
**/.turbo/**              # Turbo build cache
**/.rollup.cache/**       # Rollup cache
**/coverage/**            # test coverage reports
**/playwright-report/**   # Playwright reports
**/node_modules/**        # vendored dependencies
**/.pnpm-store/**         # pnpm store
**/.firebase/**           # Firebase build artifacts
package-lock.json         # lockfiles
pnpm-lock.yaml
yarn.lock
bun.lockb
*.min.js                  # minified bundles
*.min.css
```

**Project-specific extensions:** if the project's `CLAUDE.md` or `.claude/CLAUDE.md` lists additional generated/build artifacts to skip, append them to this list.

**Apply this filter BEFORE Step 1.** All downstream steps (routing, counting, dispatching code-explorer, passing files to reviewers) operate on the filtered list. The full unfiltered diff stays available for context only — it is never the basis of an explore or review action.

If a file in the diff matches an exclusion pattern, the orchestrator must:
- Not include it in the changed-files count for size classification
- Not include it in the area buckets dispatched to code-explorer
- Not pass it as a target file to any reviewer
- Mention the count briefly in the report header ("N codegen/build files in diff, excluded from review")

### Step 1 — Parse & Route

Analyze the **filtered** diff (from Step 0):
- Count distinct changed areas (frontend / backend / DB / config / tests)
- Migration files present → force Security + Architecture Review
- Auth / permission / env files changed → force Security Review
- PR size based on filtered file count: small <5 files, medium 5-15, large >15

Routing rules:

| Reviewer | Trigger |
|---|---|
| `code-reviewer` | ALWAYS |
| `completeness-check` | ALWAYS |
| `test-coverage-check` | ALWAYS |
| `security-reviewer` | Backend / API / auth files changed |
| `architecture-reviewer` | Large PR OR migration OR architectural files |
| `schema-form-consistency-check` | `schema_check_mode == "always"` OR (`schema_check_mode == "auto"` AND diff touches schema files (e.g. `**/types/api/**`, `**/schemas/**`), form components (e.g. `**/*Modal.tsx`, `**/*Form.tsx`), DTOs (e.g. `**/dto/**`), or controllers (e.g. `**/*.controller.ts`)) |
| `contract-reviewer` | Diff touches `**/*.sol`, Foundry tests, deploy scripts, or token logic |
| `cross-reference-check` | Diff touches collection schemas (e.g. `**/types/collections/**`, `**/models/**`), denormalization registry/triggers, or mutation services (e.g. `**/services/**`) |

`schema_check_mode == "skip"` always skips schema-form-consistency-check regardless of diff content.

The trigger globs are sensible defaults for common project layouts; adjust per repo if conventions differ.

### Step 2 — Code Exploration

For each distinct changed area (from the filtered file list — see Step 0), spawn a code-explorer agent (Agent tool, parallel).

Pass to each code-explorer:
- The list of changed files for this area (already filtered against generated/build artifacts)
- The relevant Fallow slice (`fallow.duplication` if duplication-relevant area)
- Explicit exclusion notice in the prompt:

```
The changed-files list has been filtered upstream to exclude generated, build, and vendored artifacts. Do NOT Read, Glob, or otherwise explore any path matching these patterns even if you encounter references to them in the diff or in imports of changed files:

**/generated/**, **/__generated__/**, **/api/models/**, **/dist/**, **/build/**, **/.next/**, **/.turbo/**, **/.rollup.cache/**, **/coverage/**, **/playwright-report/**, **/node_modules/**, **/.pnpm-store/**, **/.firebase/**, package-lock.json, pnpm-lock.yaml, yarn.lock, bun.lockb, *.min.js, *.min.css

If a hand-written file imports from one of these paths, that's expected — note the symbol name but do not open the generated source. Treat generated code as a black box.
```

### Step 3 — Parallel Reviews

After all code-explorer agents finish, spawn the routed reviewers in parallel (single Agent-tool message with multiple tool_use blocks):

| Agent | Inputs |
|---|---|
| `code-reviewer` | All explorer summaries + full diff + `fallow.duplication` |
| `security-reviewer` (if routed) | Full diff |
| `architecture-reviewer` (if routed) | ARCHITECTURE.md content (if found) + full diff + `fallow.boundaries` + `fallow.circulars` + `fallow.complexity` |
| `schema-form-consistency-check` (if routed) | Full diff + list of relevant changed files |
| `cross-reference-check` (if routed) | Full diff + list of relevant changed files |
| `completeness-check` | Full diff + `fallow.unused` (filtered to files in the diff) |
| `test-coverage-check` | Full diff |

When passing a Fallow slice, prefix it in the agent prompt with:

```
## Deterministic baseline (from Fallow)

The following findings are deterministically verified (static analysis).
Do NOT re-discover them — they are facts, not your job.

[paste the relevant fallow.* string here]

Your task:
- Judge whether these Fallow findings matter in the PR's context
  (e.g. is the duplication intentional or anti-pattern?)
- Focus your own analysis on what Fallow cannot see:
  business logic, schema drift, unhandled edge cases, race conditions,
  convention adherence, naming, clarity, security implications.
```

If the relevant Fallow slice is empty, omit the entire block.

### Step 4 — Aggregate
**Contract-Findings (v-team):** Findings vom `contract-reviewer` blockieren den Merge wie Criticals, aber zusaetzlich gilt: bei jedem Diff, der `.sol`/Foundry/Token-Logik beruehrt, ist der Merge NIE automatisch. Das Verdict endet zwingend mit einem menschlichen Review-Gate, egal wie sauber die Findings sind.


**Output language:** the aggregated report is in **English**. Sub-reviewer outputs are already English (per their prompts). German is only used for direct verbatim quotes from German source files (e.g. PRD content). The Boot Summary that goes back to the user can stay German for UX, but the aggregated review report is English-only.

Parse each reviewer's output. Reviewer findings (code-reviewer, security-reviewer, architecture-reviewer, schema-form-consistency-check, cross-reference-check) follow a strict format:

```
REVIEWER: <reviewer-id>
SEVERITY: critical | warning | info
STATE: active | dormant
CONFIDENCE: high | medium | low
SCOPE: pr-specific | systemic
FILE: <primary-file>:LINE
RELATED-FILES: <other-paths>:LINE   (optional, omit when single-file)
EVIDENCE: ... (multi-line code block)
ISSUE: <one sentence>
[FAILURE-MODES: ...]            (only when one root cause + fix has multiple manifestations — Dedup principle)
[VULNERABILITY-CATEGORY: ...]   (security-reviewer only, metadata)
[REPRO: ...]                    (Critical only)
FIX: <paste-ready code block + trade-off>
[SEVERITY-RATIONALE: ...]       (required for Critical: one-line rubric reference)
[SEVERITY-DEFENSE: ...]         (borderline only — longer explanation)
[WHY-CONFIDENT-OR-NOT: ...]     (medium/low CONFIDENCE only)
```

**Standard fields used by every reviewer:** REVIEWER, SEVERITY, STATE, CONFIDENCE, SCOPE, FILE, EVIDENCE, ISSUE, FIX. Other fields are conditional/metadata.

**State enforcement (v2.5):** Per the canonical severity rubric, dormant findings have a maximum severity of Warning. If a reviewer outputs `SEVERITY: critical, STATE: dormant`, the orchestrator must demote it to `SEVERITY: warning` (and note the demotion in the report). Critical-bucket should only contain active findings.

**Dedup awareness (v2.5):** Reviewers should already merge same-root-cause + same-fix findings into one entry with `FAILURE-MODES:` sub-bullets. If the orchestrator detects two distinct findings with identical FILE+FIX-Block content (across same or different reviewers), merge them post-hoc into one entry with a `FAILURE-MODES:` block. Inflated counts erode credibility.

**Haiku-Checker handling:** `completeness-check` and `test-coverage-check` produce plain-list output (no SEVERITY/STATE/CONFIDENCE/SCOPE fields). The orchestrator does NOT route their entries through severity buckets:
- `completeness-check` output renders directly under `### ✅ Completeness`. Each entry is treated as informational, not a merge blocker.
- `test-coverage-check` output renders directly under `### 🧪 Missing Tests`. Same treatment.

Group reviewer findings by SCOPE first, then SEVERITY, then CONFIDENCE.

**Routing:**
- `SCOPE: pr-specific` findings → main severity buckets (Critical / Warnings / Info)
- `SCOPE: systemic` findings → separate "📐 Architectural Observations" section
- Low-confidence findings within each severity → collapsed `<details>` block

**Merge verdict basis:** ONLY pr-specific Critical and Warning findings drive the merge verdict. Systemic findings are tech-debt observations, not merge blockers.

**Header — frontload structural map:**

The header at the top of the report exposes structural data first (so the reader gets a map before findings):

```markdown
## 🔍 Code Review — [branch] → [base]
**[date] | [size] PR | [stack]**

**Diff:** [N files, +X/-Y lines] | **Stack:** [detected] | **Fallow:** [N findings, M PR-relevant]

**Top complexity hotspots (Fallow):**
- `<filename>` — cyclo <N>, <lines> lines
- `<filename>` — cyclo <N>
- `<filename>` — cyclo <N>
- (top 3-5 hotspots from PR-relevant Fallow output)

**Reviewer-Pipeline:** Fallow → N× code-explorer → M× Reviewer → K× extended-reasoner → prd-reviewer

---
```

If Fallow is unavailable or returns no hotspots, omit the hotspots line.

**Then the body:**

```markdown
### 🔴 Critical (PR-specific)

These are merge blockers introduced or fixable within this PR.

**1. [Finding title]**
- **File:** `path/to/file.ts:LINE`
- **Reviewer:** [reviewer-id]
- **Issue:** [issue line]
- **Fix:** [fix line, with paste-ready code block for Criticals]
- **Repro:** [concrete trigger]
- **Evidence:**
  ```
  [code snippet]
  ```
[Extended Reasoning <details> block goes here in Step 4.5]

### 🟡 Warnings (PR-specific)

**Active (high/medium confidence):**
1. [Finding 1]
2. [Finding 2]

<details><summary>Niedrig-confident (N) — manuelle Prüfung empfohlen</summary>

- [Finding with WHY]

</details>

### 🔵 Info / Minor (PR-specific)
[same Active vs Low-Confidence structure]

### ✅ Completeness
[findings or 'Keine']

### 🧪 Missing Tests
[findings or 'Keine']

---

### 📐 Architectural Observations (codebase-wide, not PR-introduced)

These are systemic patterns the reviewers noticed during this PR's review. They are NOT merge blockers — track separately as tech-debt.

**Warning-level systemic findings:**
1. [Finding 1]

**Info-level systemic findings:**
- [Finding 1]

(If a critical-severity systemic finding exists — rare — surface it here with explicit "Critical (systemic)" label, but the merge verdict still doesn't gate on it; flag it in the verdict's "follow-up" section instead.)

---

### 📊 Structural Baseline (Fallow)
[short summary: total findings, how many PR-relevant, link to file if huge]
```

If the systemic-findings list is empty, omit the entire "Architectural Observations" section. If `fallow.*` slots are all empty, omit the Structural Baseline section.

### Step 4.5 — Extended Reasoner Fan-Out (parallel, on Critical only)

Parse the aggregated output for `SEVERITY: critical` entries (both pr-specific AND systemic — extended-reasoner runs on critical findings regardless of scope, since the forensic depth is valuable either way). Let N = count.

If N == 0: skip directly to Step 5.

Else: spawn N `extended-reasoner` agents IN PARALLEL — single Agent-tool message with N tool_use blocks. Each agent receives:
- Exactly ONE critical finding (REVIEWER, file, line, issue, fix, evidence) — the REVIEWER value preserves attribution
- The full git diff
- The code-explorer summary for the affected area (pick by file path; if none matches, use the closest-by-path summary)

Each agent returns either:
- **A confirmed Extended Reasoning block** (REPRO / Trigger / Step-by-step / Why type-system doesn't catch / Root cause / Fix options), OR
- **A single `REFUTED — originally flagged by <reviewer-id>. <reason>` line** (no other content) if the finding can't be reproduced

**Splice logic:**

For each agent output, parse the FIRST line:
- If the first line starts with `REFUTED`:
  - REMOVE the original Critical finding from its severity bucket (Critical PR-specific or Critical systemic)
  - Extract the originating reviewer-id from the `originally flagged by <reviewer-id>` clause
  - APPEND `{ original-finding-snippet, original-file:line, original-reviewer-id, refutation-reason }` to a working list called `refuted_findings`
- Otherwise (confirmed Extended Reasoning block):
  - Splice the block under its corresponding Critical entry as `<details><summary>Extended reasoning</summary>...</details>`

After Steps 5 (PRD) and before Step 6 (output), if `refuted_findings` is non-empty, append a Refuted block at the **very end of the report** (after Architectural Observations, after Structural Baseline):

```markdown
---

<details><summary>Refuted by extended-reasoner ({count})</summary>

These were initially flagged but refuted on deep inspection — they do NOT count toward the merge verdict.

The attribution shows the pipeline working: a sub-reviewer flagged the finding, extended-reasoner verified deterministically, and either a guard, a language semantic, or a downstream mechanism rendered the concern moot.

- **{original-issue-line}** ({original-file:line})
  *Originally flagged by:* `{reviewer-id}`
  *Refuted:* {reason}

- **{original-issue-line}** ({original-file:line})
  *Originally flagged by:* `{reviewer-id}`
  *Refuted:* {reason}

</details>
```

Refuted findings do NOT appear in the Critical bucket and do NOT contribute to the merge verdict.

Failure isolation: if one extended-reasoner crashes or times out, the others continue. The affected critical keeps its short form without an extended block, and the report notes "extended reasoning failed for this finding". The finding remains in its bucket (treated as confirmed without forensic depth).

### Step 5 — PRD / Issue Check

Tell the user:
"Technischer Review fertig. PRD + Issue Markdown bereitstellen für finalen Check — oder 'skip' eingeben."

If provided, spawn a `prd-reviewer` agent.
Pass: full diff + aggregated technical findings (with Extended Reasoning blocks) + PRD content + Issue content.

If user types 'skip': proceed directly to Step 6.

### Step 6 — Output (with severity-bucket verdict)

Before producing the output, build the Merge-Verdict section. The verdict has TWO views: severity-buckets (for PM / Tech-Lead deciding "can I merge today?") and a fix-order list (for the Dev to know what to do first):

```markdown
## Merge-Verdict

**[APPROVE | REQUEST CHANGES | NEEDS DISCUSSION]** — [N] Critical, [M] PRD/Issue ACs unmet (if applicable).

### Hard Blockers (must fix before merge)
- <Critical findings + PRD/Issue ACs explicitly required by the spec>

### Strongly Recommended (should fix or follow-up ticket before merge)
- <Warnings with high impact + PRD/Issue ACs flagged "should-fix">

### Acceptable to Defer (tech-debt, follow-up)
- <Architectural Observations (systemic findings)>
- <Info-level cleanup>

### Empfohlene Reihenfolge zum Beheben (für den Dev)
[fix-order list, prioritized by dependency / risk / impact]
```

**Output destination:**

If gh available AND PR number provided:
```bash
gh pr comment [PR_NUMBER] --body "[full formatted review]"
```

If gh fails (e.g. token doesn't have org access): fallback automatically.

Fallback: save to `./code-review-[branch]-[YYYY-MM-DD].md` and print the file path in chat.

---

## Error Handling
- Sub-agent fails: log, continue with available results.
- No ARCHITECTURE.md: architecture-reviewer infers from codebase — note in output.
- No PRD/Issue: skip Step 5.
- gh not available: fallback automatically.
- Fallow binary missing: skip baseline, note "install ausführen?" in boot summary.
- Fallow run fails (corrupt repo, missing main ref): skip baseline for this run, note in boot summary, do not block.
- extended-reasoner crashes for one critical: others continue; affected critical keeps short form without forensic depth.
- extended-reasoner returns REFUTED: finding moves to Refuted block at end of report (with reviewer attribution), doesn't count toward merge verdict.
