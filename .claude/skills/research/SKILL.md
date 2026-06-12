---
name: research
description: Research an external API, library, or unfamiliar technology before development begins. Creates a research.md with everything the agent needs to know, plus learning tests for external dependencies. Use when user mentions "research", "neue API", "externe Library", "Dokumentation lesen", or when a feature requires integration with an unfamiliar external system.
---

# Research

Research an external dependency ONCE, write it down, and make it available for all future sessions. This avoids burning context budget on re-exploration every time the agent starts fresh.

Research has an expiry date. After the sprint or feature completion, research.md gets deleted. Stale research leads to code against APIs that no longer exist.

## Prerequisites

This skill uses **Context7** (MCP or CLI) to fetch up-to-date, version-specific documentation. If Context7 is not available, the skill falls back to web fetching — but results may be less current.

Context7 MCP tools used:
- `resolve-library-id` — resolves a library name to a Context7 ID
- `query-docs` — fetches current docs for a specific library, optionally filtered by topic and version

**Important:** Context7 is used ONLY during the research phase to write research.md. After research.md is written, the Context7 MCP server is no longer needed. This keeps the context budget clean during development — the agent reads research.md from disk instead of querying Context7 in every session.

## Process

### 1. Identify what needs to be researched

Ask the user ONE question: "What external API, library, or technology do you need to integrate?"

If the user has already provided context, skip to step 2. Clarify only if ambiguous:

- Is it an external API (Stripe, Twilio, ERP system, internal service from another team)?
- Is it a library you haven't used before (new SDK, framework, tool)?
- Is it a technology the agent is unlikely to know well (proprietary protocol, legacy system)?

If the feature only touches your own code with no external dependencies, tell the user: "No research phase needed — you can go straight to the PRD."

### 2. Deep Research via Sub-Agents

Spawn parallel sub-agents using the Agent tool to research different aspects simultaneously. This is faster than sequential research and catches version conflicts early.

**Spawn 3 sub-agents in parallel:**

**Sub-Agent 1 — Documentation & API Surface (via Context7):**
```
Research [dependency name] using Context7 for up-to-date documentation.

1. Call resolve-library-id to find the Context7 ID for [dependency name]
2. Call query-docs with the resolved ID to fetch current documentation
   - Use topic parameter to focus on: setup, authentication, core API methods
   - If a specific version is needed, use the /org/project/version format
3. If Context7 has no entry for this library, fall back to:
   - Official API documentation (fetch from web)
   - OpenAPI / Swagger spec (if available)
   - GitHub README and examples

Output: A structured summary of every endpoint/method we need, with input/output types and examples. Mark whether docs came from Context7 (up-to-date) or web fetch (verify freshness manually).
```

**Sub-Agent 2 — Version Compatibility & Breaking Changes (via Context7 + Repo Analysis):**
```
Research version compatibility for [dependency name] with our stack.

1. Read package.json / pom.xml / build.gradle / requirements.txt in the repo to identify:
   - Current language/runtime version
   - Existing dependencies that might interact with [dependency name]
   - Any version constraints or lock files

2. Use Context7 to verify version-specific behavior:
   - Call resolve-library-id for [dependency name]
   - Call query-docs with topic "migration" or "breaking changes" or "changelog"
   - If a specific version exists in Context7 (e.g. /vercel/next.js/v15.0.0), fetch docs for THAT version
   - Compare the API surface of the latest version vs the version compatible with our stack

3. Cross-check with Context7 docs of our EXISTING dependencies:
   - For each dependency in our project that interacts with [new dependency]:
     Call resolve-library-id and query-docs to check compatibility notes
   - Example: Adding Stripe SDK? Check if our Express.js version has known issues with that Stripe version

4. If Context7 doesn't have the library or version, fall back to:
   - GitHub changelog / release notes
   - GitHub issues for version-related problems
   - npm/Maven/PyPI version history

Output: A version recommendation with justification. Flag any conflicts with existing dependencies. Include a "DO NOT USE" list of versions with known issues for our stack.
```

**Sub-Agent 3 — Gotchas, Edge Cases & Real-World Usage:**
```
Research real-world usage of [dependency name]. Look beyond the official docs:

1. Search GitHub issues (open AND closed) for:
   - Common pitfalls and workarounds
   - Rate limiting behavior (documented and undocumented)
   - Sandbox vs production differences
   - Error responses that differ from documentation

2. Search Stack Overflow / developer forums for:
   - Frequently asked questions
   - "I wish I had known this before" type posts
   - Undocumented behavior

3. Check if there are official test helpers, mock servers, or sandbox environments.

Output: A list of gotchas, pitfalls, and testing strategies. Include specific examples where possible.
```

**After all sub-agents return:** Merge their findings. If sub-agent 2 identified version conflicts, resolve them before writing research.md. If a version conflict cannot be resolved, flag it to the user immediately: "Version X of [dependency] is incompatible with your [other dependency] version Y. Here are your options: ..."

### 3. Write research.md

Create `research.md` in the repository root (or in a location the user specifies). Use the template below.

Keep it concise and actionable. No filler, no marketing copy from the docs. Only what the agent needs to write correct code.

**Template:**

```markdown
# Research: [Name of API / Library / Technology]

> **Expiry:** Delete after [current sprint / feature name / date]. APIs change. Do not let this file survive longer than one sprint.
> **Docs source:** [Context7 /org/project/version | Web fetch from URL | User-provided]

## What is it?

One paragraph. What does this dependency do and why are we using it.

## Version Decision

- **Chosen version:** [exact version number]
- **Why this version:** [compatibility reason — e.g. "Latest v3 compatible with our Spring Boot 3.2 and Java 21"]
- **DO NOT USE:** [list of versions with known issues for our stack, with one-line reasons]
- **Existing dependencies that interact:** [list from package.json / pom.xml / build.gradle]
- **Known conflicts:** [none, or describe specific conflicts and how we resolved them]
- **Upgrade path:** [what to watch for when upgrading later]

## Authentication

How to authenticate. API keys, OAuth flows, tokens, headers. Include the exact header format or SDK initialization.

## Key Endpoints / Methods

The endpoints or methods we actually need for our feature. Not the full API surface — only what's relevant.

For each endpoint/method:
- **What it does** (one sentence)
- **Input** (parameters, types, required vs optional)
- **Output** (response shape, status codes)
- **Example** (minimal request/response or code snippet)

## Data Formats

Request/response shapes we need to handle. Include actual JSON/XML structures if relevant. Note any non-obvious field names, date formats, enum values, or nested structures.

## Error Handling

How errors are returned. Status codes, error objects, retry behavior. What happens on rate limiting, invalid input, auth failure. Include the actual error response format.

## Gotchas & Pitfalls

Things that are NOT obvious from the docs:
- Undocumented behavior you discovered
- Rate limits and throttling rules
- Pagination quirks
- Sandbox vs production differences
- Version-specific breaking changes
- Fields that are documented but don't work as described

## SDK / Library Setup

If using an SDK: how to install, initialize, and configure it. Include the exact package name and version.

## Testing Strategy

How to test against this dependency:
- **Sandbox/test environment available?** (URL, test credentials)
- **Mock strategy:** How to mock this in tests (in-memory adapter, recorded responses, official test helpers)
- **Test data:** Known test values that produce predictable results (e.g. Stripe test card numbers)
```

### 4. Resolve version conflicts (if any)

If sub-agent 2 flagged version conflicts in step 2, resolve them NOW — before writing learning tests.

Check:
- Can we pin a specific version that satisfies all constraints?
- Do we need to upgrade/downgrade an existing dependency first?
- Is there an alternative library that avoids the conflict?

If the conflict requires a decision from the user (e.g. upgrading a core framework), stop and present the options with trade-offs. Do NOT proceed with an incompatible version.

Update research.md's "Version Decision" section with the resolution.

### 5. Write learning tests

If the dependency is an external library or SDK (not a raw HTTP API), write learning tests. These are unit tests that verify the library behaves as documented.

Learning tests are NOT for the build. They are a contract: "We expect this library to behave THIS way."

Rules for learning tests:
- One test file per dependency, placed in `learning-tests/` directory (create if it doesn't exist)
- Test the behaviors YOUR feature relies on — not the entire library surface
- Include edge cases: What happens with empty input? Null? Invalid data? Boundary values?
- Each test should have a clear name that documents the expected behavior: `stripe_charge_with_invalid_card_returns_card_error`
- Do NOT add learning tests to the regular test suite or CI pipeline — they run manually after dependency updates
- **Pin the exact version in the test file header as a comment** — so you know which version these tests were written for: `// Learning tests for @stripe/stripe-node@14.21.0 — re-run after every update`
- **Include one version smoke test** that asserts the installed version matches expectations — this catches accidental upgrades immediately

Prompt pattern for generating learning tests:

```
1. Fetch the documentation for [library name] version [chosen version from research.md]:
   - Use Context7: resolve-library-id for [library name], then query-docs with version
   - If Context7 unavailable: Read the documentation in research.md

2. Write learning tests that verify every behavior our feature depends on.
   Include edge cases and boundary values.
   Place them in learning-tests/[library-name].test.[ext]
   These tests are NOT for CI — they verify library behavior after updates.

3. Pin the version: Add a header comment with the exact version tested.
   Add one smoke test that asserts the installed version matches.
```

If the dependency is a raw HTTP API (not an SDK), skip learning tests and instead note the mock strategy in research.md.

### 6. Verify with the user

Present a short summary to the user:
- "Here's what I found. Does this match your understanding?"
- "Are there any endpoints or behaviors I missed?"
- "Any gotchas you already know about that aren't in the docs?"

If the user adds information, update research.md accordingly.

### 7. Remind about expiry

End with: "research.md is ready. Remember to delete it after [sprint/feature] is done — stale research leads to code against APIs that no longer exist."

## Anti-Patterns

- Do NOT copy-paste entire API documentation into research.md — summarize what's relevant
- Do NOT include information about endpoints/methods you won't use
- Do NOT leave research.md in the repo after the feature ships
- Do NOT skip the gotchas section — that's where the real value is
- Do NOT write learning tests for your own code — only for external dependencies
- Do NOT assume the latest version is compatible — always check against your existing stack first
- Do NOT skip the version compatibility sub-agent — installing an incompatible version wastes hours of debugging
- Do NOT install a dependency without checking if an existing dependency already covers the same functionality
- Do NOT leave Context7 MCP connected during development — use it during research, write research.md, then the agent reads from disk
- Do NOT trust Context7 docs blindly if the library has a very low trust score — cross-check with official sources
