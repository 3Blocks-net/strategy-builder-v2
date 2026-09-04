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
| `docs/produkt.md` | Produkt-Grundlagen (Zielbild): welches Problem wir lösen, für wen, und die Nutzer-Journey der Lösung — plus die nicht verhandelbaren Leitplanken. Specs und Issues richten sich daran aus. | Vor jedem neuen Epic/Feature; wenn unklar ist, ob etwas zum Produkt passt. |
| `docs/discovery/` | 9 Reverse-Specs (Black-Box-Contracts, rückwärts aus dem Bestandscode rekonstruiert, Stand Commit `7ca671b`): encode-boundary, execution-indexer, mcp-assistant, portfolio-cockpit, siwe-auth, step-catalog, strategy-graph-editor, vault-contracts, wick-wait-strategy. Dazu `produkt-strategie/analyse.md` (Ist-Stand, Gaps, Monetarisierung, Roadmap) und `absicherungs-paket/` (Epic + Problem Statement, fachlich abgenommen). | Du fasst einen dieser Bereiche an; du willst wissen, was ein Bereich fachlich verspricht; Produkt-/Roadmap-Fragen. |
| `docs/roadmap.md` | Die Bau-Reihenfolge: neun Meilensteine M0–M8, jeder als GitHub-Milestone mit Epic-Issue. Enthält die Zuordnung der öffentlich zugesagten Eigenschaften und die offenen Entscheidungen, die einzelne Meilensteine blockieren. | Bevor du ein neues Vorhaben beginnst; wenn unklar ist, was als Nächstes dran ist. |
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

### Sprachen

| Wo | Sprache |
|---|---|
| Code, Kommentare, Dateinamen, Commit-Messages | Englisch |
| Datenbank: Tabellen, Spalten, Enums, Migrations-Namen | Englisch |
| App-Oberfläche (Frontend) | Deutsch **und** Englisch |
| Doku, GitHub-Issues, Gespräch | Deutsch |

Die Zweisprachigkeit der Oberfläche ist entschieden (2026-09-04) und gilt für
jede neue Seite ab sofort — nicht als späterer Nachrüst-Schritt.

### Finanzbegriffe

Fachbegriffe aus Finanzwelt und DeFi werden **englisch** geschrieben oder mit
dem korrekten Fachbegriff benannt — nie mit einer selbst gebauten deutschen
Übersetzung. Das gilt in Doku, Issues, Code und Oberfläche gleichermaßen.

Richtig: `Stop-Loss` · `DCA` · `Grid` · `Limit Order` · `Performance Fee` ·
`Management Fee` · `High-Water-Mark` · `Health Factor` · `Slippage` · `TWAP` ·
`Spot` · `minOut` · `Swap` · `Deposit Fee` · `Withdraw Fee` · `Credits` ·
`Keeper` · `Vault` · `Step` · `Recipe` · `Automation` · `Confirm-Gate` ·
`Discount Vector`

Falsch, weil erfunden: „gestreckter Kauf", „Verlust-Grenze", „Preis-Gitter",
„Erfolgsbeteiligung", „Höchstmarke", „Grundgebühr", „Gesundheitsfaktor",
„Ausführer", „Rabatt-Vektor", „Mindest-Ausgabe", „Tausch".

Gewöhnliche deutsche Wörter bleiben deutsch. Die Regel greift für Begriffe, die
in der Branche einen feststehenden Namen haben.

## Generierter Code

Niemals generierten oder Build-Output reviewen oder editieren: `**/generated/**`,
`**/dist/**`, `**/build/**`, `**/.next/**`, `node_modules`, Lockfiles, `*.min.*`.
