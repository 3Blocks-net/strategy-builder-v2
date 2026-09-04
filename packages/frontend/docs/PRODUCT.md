# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two user groups, one app — the difference is the path through it, not the product
(per `docs/produkt.md`, binding):

- **Power-User (beachhead, build-first — decided 2026-07-27):** knows ticks,
  health factor, slot semantics; runs DeFi strategies by hand or with homegrown
  tooling today. Wants precision and depth: free strategy composition
  (graph editor), own building blocks, deliberate opt-outs. Control and power
  are mandatory; comfort is a bonus.
- **Einsteiger/Intermediate (later, once the safety foundation carries):**
  already holds crypto, wants their assets to work, is deterred by DeFi
  complexity. Wants understandable strategies instead of ticks, protection
  active without configuration, the whole picture at a glance — the
  "Trade Republic feeling" for DeFi.

Both groups: already hold crypto (fiat onboarding is not the core problem),
self-custody-affine (giving up control is a dealbreaker), yield-oriented rather
than speculative, time-poor ("set up and let it run").

Not for: users who want full custodial management, or pure high-risk speculation.

## Product Purpose

Pecunity bundles DeFi into one app with the usability of a modern broker:
portfolio overview, building and automating strategies, entry and exit, market
discovery — in one place, self-custodied, with protection as the default.

It solves DeFi's fragmentation (dozens of protocols, dashboards, wallets — no
whole picture) and its four compounding pains: manual 24/7 attention, custody
as the price of convenience, complexity with real loss risk, and missing
built-in protection. Success means a user can set up a strategy, walk away,
and trust that silence provably means "all is well."

## Positioning

Automation that runs unattended **without** taking custody: the user's own
vault smart contract (permissionless factory, no provider admin access to
funds), keepers that can only execute what the user deployed and only when the
trigger is provably met on-chain, and a server-enforced confirm gate on every
signing action — including those initiated by the AI copilot. Convenient
competitors take custody; self-custody competitors don't automate. Pecunity
refuses that trade.

## Operating Context

- The user journey (target picture, 9 stations) is specified in
  `docs/produkt.md`: public discovery gallery with verifiable track records →
  risk-free demo/simulation → sign-in via wallet or email/social (embedded,
  still self-custodied) → choose/build a strategy (gallery, AI copilot, or
  graph editor) → protection layers on by default → two-phase confirm &
  deploy → keeper-run automation → cockpit with USD valuation, flow-adjusted
  PnL, and proactive alerts → fair fees (high-water-mark performance fee;
  credits or on-chain rails).
- Today's built surface (this package): connect page (SIWE wallet auth),
  dashboard, vault pages, and the automation/graph editor
  (`@xyflow/react`). What exists vs. the target picture is analyzed in
  `docs/discovery/produkt-strategie/analyse.md`.
- The AI copilot runs through an MCP assistant; every action it initiates
  passes the same confirm gate as manual actions.
- Target chain: BSC. On-chain reads via viem; wallet stack wagmi/viem.

## Capabilities and Constraints

- Stack of this package: Vite + React 19, Tailwind v4, wagmi/viem,
  `@xyflow/react`. Backend: NestJS + Prisma, SIWE auth (JWT).
- Non-negotiable guardrails (from `docs/produkt.md`):
  1. Self-custody always — no feature justifies provider access to funds.
  2. Protection is default, risk is opt-in — never the reverse.
  3. No signature without explicit user consent, including via AI.
  4. Honest feedback — failures are reported, never swallowed.
  5. One source of truth for fee logic on-chain and off-chain.
- Architecture invariants (encode boundary, step semantics, self-custody) are
  binding: `CODING_STANDARDS.md`.
- **Languages: both German and English are planned** for the UI (confirmed
  2026-08-25). Current code and UI copy are English; rollout order and i18n
  mechanism are undecided — record decisions here when made.
- Next planned work package: `docs/prd/absicherungs-paket.md` (12 stories,
  protection features; approved, not yet built).

## Brand Commitments

- Name: **Pecunity**. Binding brand kit: https://pecunity.io/branding
  (confirmed 2026-08-25; brand inquiries info@pecunity.io).
- Colors: Brand Blue `#4568D0`, Dark `#0E1116`, Text `#414C66`,
  Secondary `#63749C`, Light Background `#F2F4FD`.
- Typography: **Chillax** (Fontshare) exclusively for the Pecunity wordmark;
  **Geist** (Vercel) for all body text, UI elements, and headings.
- Logo: five variants (Symbol, Logo Light/Dark, Mono Light/Dark) downloadable
  from the brand kit. Clear space ≥ height of the "P" on all sides; never
  stretch, rotate, or recolor; contrasting backgrounds only.
- Logo assets are **not yet vendored into this repo** — download from the
  brand kit before first use in the UI.
- Standing visual preference (chosen 2026-08-25): **category-standard fintech
  execution** — no experimental visual world; conventional broker-app design
  language at full craft. The craft bar is **Trade Republic and Robinhood**:
  calm, number-first, impeccably finished consumer-broker UI.

## Evidence on Hand

- Reverse-engineered black-box specs of the 9 built areas:
  `docs/discovery/` (state: commit `7ca671b`).
- Product target picture with user journey: `docs/produkt.md`.
- Gap analysis, monetization decisions, roadmap:
  `docs/discovery/produkt-strategie/analyse.md`.
- No marketing site copy, testimonials, track-record data, or performance
  numbers exist in this repo — the discovery gallery's "verifiable track
  records" are target-picture claims. Do not fabricate performance figures,
  user counts, or testimonials in any surface.

## Product Principles

1. **Trust is earned by verifiability, not promises** — show provable numbers,
   on-chain evidence, and honest failure states; never sell with claims the
   product can't prove.
2. **Protection before power** — safe defaults everywhere; depth and risk are
   deliberate opt-ins for experts, never the price of entry.
3. **One product, two paths** — every capability must remain reachable simply
   (standard path) and precisely (expert mode); neither group is sacrificed.
4. **Silence must mean "all is well"** — the app reports proactively when it
   matters; absence of alerts is a verified state, not a blind spot.
5. **The user signs, always** — no flow, convenience, or AI suggestion ever
   bypasses explicit per-action consent.
