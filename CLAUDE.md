# CLAUDE.md

@AGENTS.md

Steuert, wie Claude Code in diesem Repo arbeitet. Der wichtigste Hebel dafür, dass alle Entwickler und jeder Agent gleich arbeiten. Kurz und aktuell halten.

> Der Entwicklungs-Workflow (Idee → Spec → Build → Review) läuft über **shipcraft** (`/setup`, `/idee`, `/weiter`). Die Pro-Projekt-Konfiguration liegt nach dem Setup unter `docs/agents/`.

## Stack

pnpm-Monorepo (`packages/*`), Node ≥ 22, TypeScript (strict). Ziel-Chain: BSC.

- **`shared`** — framework-freie reine Helfer (Unit-Conversion, Validierung, Encode-Boundary `mapGraphToRaw`, Step-Rollen). Build `tsc`, Tests **Vitest**.
- **`backend`** — NestJS + Prisma + PostgreSQL; SIWE-Auth (JWT). Tests **Jest**; DB via `pnpm db:up`, Migration/Seed via Prisma (`pnpm db:migrate` / `db:seed`).
- **`frontend`** — Vite + React 19, wagmi/viem, Tailwind v4, `@xyflow/react` (Graph-Editor). Tests **Vitest**.
- **`contracts`** — Solidity + Hardhat (Ignition-Deploys, Fork-Tests). Tests `hardhat test`.
- **`mcp`** — lokaler MCP-Server (stdio, offizielles MCP SDK), viem/ethers/siwe/keytar; steuert DeFi-Vaults per KI-Assistent (Read- + Write-Tools, signierende/sensible Aktionen hinter dem PolicyGate-Confirm-Gate). Keystore-Passwort im OS-Keychain. Tests **Vitest**. Init lokal via `pnpm --filter mcp run init` (`pecunity-mcp-init` nur nach globalem Link).

> Test-Runner ist gemischt: Backend = Jest, alles andere = Vitest. On-chain-Reads über viem; Keystore-Decrypt über ethers.
>
> Ports: backend **3001**, frontend **5173**, Hardhat-Fork **8545**. `backend:dev` läuft im Watch-Mode (hot-reload) → reine Seed-Daten-Änderungen brauchen nur `pnpm db:seed` (kein Restart), Schema-/Model-Änderungen `prisma migrate dev`. Recipes/StepTypes werden beim Seed gegen den deployten Katalog validiert (ungültige werden übersprungen). Der Seed ist **self-pruning**: StepType-Zeilen, die nicht zum aktuellen Deploy gehören (per id abgeglichen), werden entfernt — ein Redeploy mit neuen Adressen hinterlässt also keine Duplikate. `deploy-fork.ts` deployt den vollständigen DeFi-Satz inkl. `SwapToRangeRatio` + `WickWaitRebalanceCondition`.

## Konventionen

- Tests gegen beobachtbares Verhalten über die öffentliche Schnittstelle, nie gegen Implementierungsdetails. Mock nur an Systemgrenzen.
- Deep modules bevorzugen: kleine Schnittstelle, viel Implementierung dahinter.
- Commits: Conventional Commits (feat, fix, chore, docs, refactor, test, perf).
- TDD pro Slice (RED → GREEN → REFACTOR), eine vertikale Schicht nach der anderen — nicht alle Tests zuerst.
- **Eine Quelle für die Encode-Boundary:** `mapGraphToRaw` & Co. leben in `shared`; Frontend und MCP konsumieren sie — keine Zweitimplementierung/Drift.
- **Self-Custody/Security:** Key-Material und Secrets nie loggen, serialisieren oder ins Repo committen (Keystores sind git-ignored); schreibende/signierende MCP-Aktionen laufen durch ein server-erzwungenes Confirm-Gate.
- Step-Semantik (Token/Betrag/Empfänger/Richtung) schema-getrieben über `x-ui-role`/`x-ui-widget` auflösen — kein per-step-type-Code.

## Definition of Done

Ein Issue ist erst fertig, wenn:
- alle Acceptance Criteria erfüllt und durch Tests verifiziert sind,
- die Tests grün sind und der Lint sauber ist,
- ein code-review ohne offene Hard Blocker abgeschlossen ist.

## Issue-Tracker

Issues leben lokal im Repo (Tracker wird von shipcraft `/setup` konfiguriert, siehe `docs/agents/issue-tracker.md`). Linear wird nicht mehr verwendet.

## Doku-Altbestand

`docs/legacy-specs/` enthält die eingefrorenen OpenSpec-Specs des früheren Workflows (MCP, Encode-Boundary, Step-Catalog, Wick-Wait). Sie sind Referenz, keine lebende Source of Truth — Verhalten im Zweifel gegen den Code prüfen. Beim Wieder-Anfassen eines Bereichs relevantes Wissen in `CONTEXT.md`/ADRs überführen.

## Generierter Code

Niemals generierten oder Build-Output reviewen oder editieren: `**/generated/**`, `**/dist/**`, `**/build/**`, `**/.next/**`, `node_modules`, Lockfiles, `*.min.*`.
