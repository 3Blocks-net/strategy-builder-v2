# CLAUDE.md

Steuert, wie Claude Code in diesem Repo arbeitet. Der wichtigste Hebel dafür, dass alle Entwickler und jeder Agent gleich arbeiten. Kurz und aktuell halten.

## Plan-Phase-Regel (Pflicht)

Sobald ein Planungs-Signal auftaucht ("ich will X bauen", "plane Y", "neues Feature", "refaktoriere Z"), NICHT direkt Code schreiben.

Stattdessen in dieser Reihenfolge:
1. Falls eine externe Abhängigkeit im Spiel ist (neues SDK, fremde API): erst die `research`-Skill.
2. Dann klären: Codebase lesen, Optionen mit Trade-offs vorschlagen, offene Fragen stellen (brainstorming + `grill-me`). Auf Antwort des Nutzers warten.
3. Erst danach `/opsx:propose <change-name>`.

Erst wenn die Spec vom Nutzer im Review freigegeben ist, mit der Implementierung beginnen. Bei trivialen Änderungen (Typo, einzeiliger Fix) darf der Ablauf übersprungen werden.

## Stack

pnpm-Monorepo (`packages/*`), Node ≥ 22, TypeScript (strict). Ziel-Chain: BSC.

- **`shared`** — framework-freie reine Helfer (Unit-Conversion, Validierung, Encode-Boundary `mapGraphToRaw`, Step-Rollen). Build `tsc`, Tests **Vitest**.
- **`backend`** — NestJS + Prisma + PostgreSQL; SIWE-Auth (JWT). Tests **Jest**; DB via `pnpm db:up`, Migration/Seed via Prisma (`pnpm db:migrate` / `db:seed`).
- **`frontend`** — Vite + React 19, wagmi/viem, Tailwind v4, `@xyflow/react` (Graph-Editor). Tests **Vitest**.
- **`contracts`** — Solidity + Hardhat (Ignition-Deploys, Fork-Tests). Tests `hardhat test`.
- **`mcp`** — lokaler MCP-Server (stdio, offizielles MCP SDK), viem/ethers/siwe/keytar; steuert DeFi-Vaults per KI-Assistent. Tests **Vitest**.

> Test-Runner ist gemischt: Backend = Jest, alles andere = Vitest. On-chain-Reads über viem; Keystore-Decrypt über ethers.
>
> Ports: backend **3001**, frontend **5173**, Hardhat-Fork **8545**. `backend:dev` läuft im Watch-Mode (hot-reload) → reine Seed-Daten-Änderungen brauchen nur `pnpm db:seed` (kein Restart), Schema-/Model-Änderungen `prisma migrate dev`. Recipes/StepTypes werden beim Seed gegen den deployten Katalog validiert (ungültige werden übersprungen).

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
- `openspec validate` durchläuft,
- ein code-review ohne offene Hard Blocker abgeschlossen ist.

## Spec-Disziplin

- Die lebende Spec liegt unter `openspec/`. Sie ist die Source of Truth.
- Vor einem neuen Change immer die bestehenden Specs des betroffenen Moduls lesen.
- Nach dem Merge `/opsx:archive <change-name>`, beim Sync "Sync now".

## Issue-Tracker

Linear wird NUR für Epics genutzt (grobes Was-bauen-wir-Tracking auf Vorhaben-Ebene). Alles darunter bleibt lokal: Slices leben in der tasks.md des OpenSpec-Change, Bugs und Folge-Findings als lokale Issue-Dateien im Repo. Keine kleinteilige Synchronisierung nach Linear, das wäre Doppelarbeit zur lebenden Spec.

## Generierter Code

Niemals generierten oder Build-Output reviewen oder editieren: `**/generated/**`, `**/dist/**`, `**/build/**`, `**/.next/**`, `node_modules`, Lockfiles, `*.min.*`.
