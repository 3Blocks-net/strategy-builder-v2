# Severity Rubric — Canonical Source

**This file is the single source of truth for the severity rubric used by all reviewer sub-agents.**

When updating the rubric, edit this file first, then sync the canonical block into each reviewer's prompt. Each reviewer file marks the synced block with the comment `<!-- canonical: _shared/severity-rubric.md — keep in sync -->` so you know what to update.

Reviewer files that contain a synced copy:
- `.claude/agents/code-reviewer.md`
- `.claude/agents/security-reviewer.md`
- `.claude/agents/architecture-reviewer.md`
- `.claude/agents/schema-form-consistency-check.md`
- `.claude/agents/cross-reference-check.md`

---

## Canonical Severity Rubric

### CRITICAL is reserved for:

- Data corruption — including:
  - Race conditions, transactional gaps
  - Schema drift producing wrong DB state
  - Silently dropped fields on update
  - Persisting false / sentinel / placeholder data, even when trigger conditions are narrow or low-frequency

  Self-check: if this bug fires once, does the database end up with wrong data? If yes → Critical, regardless of how often it fires.

- Runtime crashes (unhandled errors, null chains, schema-validation 400 on common user paths)
- Security vulnerabilities exploitable at the affected user role's privilege boundary, or that bypass tenant / multi-org scope
- User-visible data loss

### WARNING is for:

- UX bugs (wrong error display, blocked actions, deadlocks in editing flows)
- Performance regressions (missing debounce, N+1, unbounded list renders) — even if severe
- Wrong HTTP status codes (no data corruption)
- Mass-assignment risks where role gating limits exposure (admin-only)
- Missing input validation that doesn't currently produce runtime failure
- Admin-only injection that respects privilege boundaries

### INFO is for:

- Cosmetic / convention-level drift
- Documentation gaps
- Unused exports without runtime impact
- Non-load-bearing duplications

### Severity calibration — positive rules

These positive formulations replace older "DO NOT escalate / DO NOT demote" lists. Negative instructions can paradoxically reinforce the unwanted behavior; positive rules are clearer.

**Stay-at-Warning rules** (the ceiling for these issue classes is Warning):

- Performance bugs always classify as Warning unless they directly cause a crash or DoS.
- Wrong HTTP status codes always classify as Warning — they're a UX issue, not a data issue.
- Admin-only injection that respects the existing privilege model classifies as Warning. Promote to Critical only when the privilege boundary itself is broken or when the injection bypasses tenant scope.
- Mass-assignment risks classify as Warning when role gating limits exposure. Promote to Critical only when the gating is missing or broken.

**Stay-at-Critical rules** (the floor for these issue classes is Critical, when the bug is ACTIVE):

- Data corruption stays Critical regardless of trigger frequency. Low-frequency triggers ("only fires under specific conditions") do not justify a Warning downgrade — the data is still corrupt every time the bug fires.
- Edge-case user paths stay Critical when they corrupt data. "Most users won't hit this path" is not a valid downgrade argument — the path exists.
- Recoverability stays Critical when corruption already occurs. "Can be fixed by re-editing" does not justify Warning — the corruption window exists.

### Active vs. Dormant — mandatory state classification

Every finding declares `STATE: active | dormant`:

- **Active** — the bug fires today. A user action, an API call, a system event triggers the failure mode under current code.
- **Dormant** — the bug does not fire today. Code happens to work because of a current implementation detail (a spread merge that preserves a field, a guard that exists upstream, a UI default that masks the problem). A future refactor — even a well-intentioned one — would activate the bug.

**Rule:** dormant findings have a maximum severity of Warning, regardless of the worst-case impact if they were to activate.

Why: a Critical labeled "today this works because..." erodes the credibility of every other Critical in the report. If the reviewer admits the bug doesn't fire, calling it Critical signals that the severity bar is negotiable.

A dormant finding's worst-case is communicated via `SEVERITY-RATIONALE`: "Warning because dormant; if activated by a refactor of <X>, would corrupt <Y> — Critical class." The Latent-bug framing already conveys urgency without inflating severity.

### Severity rationale (mandatory for Critical)

Every Critical finding includes a one-line `SEVERITY-RATIONALE` field that names the rubric bullet that applies:

```
SEVERITY-RATIONALE: Critical because <category from rubric>
                   — e.g. "Critical because runtime crash on common user path"
                   — or "Critical because user-visible data inconsistency"
                   — or "Critical because data corruption (race condition)"
```

This is short — typically under 15 words. It makes the severity logic verifiable: any reviewer can re-read the rubric and confirm the call.

`SEVERITY-DEFENSE` (the longer borderline-explanation field) remains optional and only fires for genuinely contested calls.

### Dedup principle (mandatory)

If two findings share **the same root cause AND the same fix**, they are ONE finding with sub-bullets, not two findings.

```
ISSUE: <root-cause description>
Failure modes:
  A. <one manifestation>
  B. <another manifestation>
FIX: <single fix that resolves both>
```

Inflated counts ("absorbed into Fix #X") signal that the reviewer split for visibility rather than substance. A merged entry with two sub-bullets is more honest and more readable.
