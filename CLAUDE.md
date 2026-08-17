# CLAUDE.md

Steuert, wie Claude Code in diesem Repo arbeitet. Kurz und aktuell halten.

@AGENTS.md

Diese Datei hält nur die durablen Projekt-Fakten fest, die unabhängig vom
Arbeitsprozess gelten. Wie gearbeitet wird, steht in `AGENTS.md`.

## Wo was liegt

Bevor du etwas Neues recherchierst oder eine bestehende Entscheidung in Frage
stellst, sieh hier nach. Vieles ist schon einmal geklärt worden.

| Ordner | Was drin steht | Wann du reinschaust |
|---|---|---|
| `docs/discovery/` | 9 Reverse-Specs (Black-Box-Contracts, rückwärts aus dem Bestandscode rekonstruiert, Stand Commit `7ca671b`): encode-boundary, execution-indexer, mcp-assistant, portfolio-cockpit, siwe-auth, step-catalog, strategy-graph-editor, vault-contracts, wick-wait-strategy. Dazu `produkt-strategie/analyse.md` (Ist-Stand, Gaps, Monetarisierung, Roadmap) und `absicherungs-paket/` (Epic + Problem Statement, fachlich abgenommen). | Du fasst einen dieser Bereiche an; du willst wissen, was ein Bereich fachlich verspricht; Produkt-/Roadmap-Fragen. |
| `docs/prd/` | `absicherungs-paket.md`: PRD mit 12 Stories, Nähten und Architektur-Entscheidungen — das nächste geplante Arbeitspaket, noch nicht gebaut. | Bevor am Absicherungs-Paket gearbeitet wird. |
| `docs/legacy-specs/` | Eingefrorene OpenSpec-Specs des ältesten Workflows (MCP, Encode-Boundary, Step-Catalog, Wick-Wait). Referenz, keine lebende Source of Truth — Verhalten im Zweifel gegen den Code prüfen. | Historische Detailfragen zu MCP-Tools oder Step-Catalog. |
| `docs/offene-punkte.md` | Die noch offenen Punkte aus dem früheren Tracker (Secret-Scan, Branch-Schutz, Dev-CVE-Entscheidung, Stale-Vault-Erkennung), bis sie GitHub Issues werden. | Bevor du ein "neues" Problem meldest — vielleicht ist es schon notiert. |
| `docs/agents/` | Konfiguration für die Skills: Issue-Tracker, Triage-Labels, Domain-Doku. Siehe `AGENTS.md`. | Wenn ein Skill den Tracker oder Labels braucht. |

Bei Konflikt zwischen dieser Datei und `docs/` gewinnt `docs/`.

## Stack

pnpm-Monorepo (`packages/*`), Node ≥ 22.22, TypeScript (strict). Ziel-Chain: BSC.

- **`shared`** — framework-freie reine Helfer (Unit-Conversion, Validierung, Encode-Boundary `mapGraphToRaw`, Step-Rollen). Build `tsc`, Tests **Vitest**.
- **`backend`** — NestJS + Prisma + PostgreSQL; SIWE-Auth (JWT). Tests **Jest**.
- **`frontend`** — Vite + React 19, wagmi/viem, Tailwind v4, `@xyflow/react` (Graph-Editor). Tests **Vitest**.
- **`contracts`** — Solidity + Hardhat (Ignition-Deploys, Fork-Tests). Tests `hardhat test`.
- **`mcp`** — lokaler MCP-Server (stdio, offizielles MCP SDK), viem/ethers/siwe/keytar; steuert DeFi-Vaults per KI-Assistent (Read- + Write-Tools, signierende Aktionen hinter dem PolicyGate-Confirm-Gate). Keystore-Passwort im OS-Keychain. Tests **Vitest**. Init lokal via `pnpm --filter mcp run init`.

On-chain-Reads über viem; Keystore-Decrypt über ethers.

## Kommandos

- Tests: `pnpm --filter shared test` · `pnpm backend:test` (braucht DB via `pnpm db:up`) · `pnpm frontend:test` · `pnpm --filter mcp test` · `pnpm contracts:test` (Fork-Tests brauchen laufenden Fork `pnpm contracts:fork:bsc`)
- E2E: `pnpm frontend:test:e2e` (Playwright) · `pnpm backend:test:e2e`
- Lint: `pnpm lint` (Biome `check` + Remnants-Guard, CI-tauglich)
- Typecheck über die Builds: `pnpm shared:build && pnpm --filter mcp build && pnpm frontend:build && pnpm backend:build`
- Dev: `pnpm dev` (Orchestrator `scripts/dev.mjs`) — backend :3001, frontend :5173, Hardhat-Fork :8545; DB `pnpm db:up`, Migration `pnpm db:migrate`, Seed `pnpm db:seed`
- Contracts: `pnpm contracts:deploy:fork` (voller DeFi-Satz inkl. `SwapToRangeRatio` + `WickWaitRebalanceCondition`); Testnet/Mainnet-Deploys nur bewusst manuell

`backend:dev` läuft im Watch-Mode: reine Seed-Änderungen brauchen nur `pnpm db:seed`,
Schema-Änderungen `prisma migrate dev`. Der Seed validiert Recipes/StepTypes gegen den
deployten Katalog und ist self-pruning (Redeploy hinterlässt keine Duplikate).

## Konventionen

Die verbindlichen Coding-Regeln stehen in `CODING_STANDARDS.md` (Tests gegen
beobachtbares Verhalten, tiefe Module, die drei Architektur-Invarianten
Encode-Boundary/Step-Semantik/Self-Custody). Commits: Conventional Commits.

## Generierter Code

Niemals generierten oder Build-Output reviewen oder editieren: `**/generated/**`,
`**/dist/**`, `**/build/**`, `**/.next/**`, `node_modules`, Lockfiles, `*.min.*`.
