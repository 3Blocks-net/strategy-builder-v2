---
created: 2026-07-25
last_verified: 2026-07-25
git_commit: 7ca671beafc34c201d4980a6ef66297bec67aa7f
---

# Projekt-Steckbrief

> Eine Datei pro Projekt. Alle Stationen lesen hieraus — besonders Prüf-Kommandos.

- Projektname: strategy-builder-v2 (Pecunity Platform)
- Plattform-Familie: Web (DApp) + lokaler MCP-Server + Solidity-Contracts (BSC)
- Sprache/Framework: TypeScript (strict) — NestJS + Prisma/PostgreSQL (backend), Vite + React 19 + wagmi/viem + Tailwind v4 + @xyflow/react (frontend), Solidity + Hardhat (contracts), MCP SDK (mcp), framework-freie Helfer (shared)
- Paketmanager: pnpm (Monorepo `packages/*`), Node ≥ 22
- Betriebssysteme im Team: macOS

## Kommandos (exakt, kopierbar)

- Test (pro Paket, Runner gemischt — Backend Jest, Rest Vitest):
  - `pnpm --filter shared test`
  - `pnpm backend:test` (baut Abhängigkeiten vor; braucht DB via `pnpm db:up`)
  - `pnpm frontend:test`
  - `pnpm --filter mcp test`
  - `pnpm contracts:test` (Hardhat; Fork-Tests brauchen laufenden Fork `pnpm contracts:fork:bsc`)
- E2E: `pnpm frontend:test:e2e` (Playwright, `packages/frontend/playwright.config.ts`); Backend-E2E: `pnpm backend:test:e2e`
- Lint: `TBD — needs research` (kein ESLint/Lint-Setup im Repo gefunden; CLAUDE.md-DoD verlangt „Lint sauber" — Setup fehlt)
- Typecheck: über die Builds (`tsc`): `pnpm shared:build && pnpm --filter mcp build && pnpm frontend:build && pnpm backend:build`
- Build: `pnpm shared:build`, `pnpm backend:build`, `pnpm frontend:build`, `pnpm --filter mcp build`, `pnpm contracts:compile`
- Dev-Server: `pnpm dev` (Orchestrator `scripts/dev.mjs`) — backend :3001, frontend :5173, Hardhat-Fork :8545; DB via `pnpm db:up` (Docker), Migration `pnpm db:migrate`, Seed `pnpm db:seed`
- Deploy: `…` (M5 — leer, bis das Veröffentlichen ausgebaut ist; Contracts: `pnpm contracts:deploy:testnet` / `contracts:deploy:mainnet`, nur bewusst manuell)

## Notizen

- Monorepo-Layout: `packages/shared|backend|frontend|contracts|mcp`; Encode-Boundary (`mapGraphToRaw`) lebt nur in `shared` — Frontend und MCP konsumieren sie.
- `backend:dev` läuft im Watch-Mode; reine Seed-Änderungen brauchen nur `pnpm db:seed`, Schema-Änderungen `prisma migrate dev`. Seed ist self-pruning gegen den deployten Katalog.
- Keine CI-Workflows unter `.github/workflows/` (Stand Audit 2026-07-25).
- Self-Custody/Security: Keystores git-ignored, Key-Material nie loggen/committen; signierende MCP-Aktionen hinter server-erzwungenem Confirm-Gate (PolicyGate).
- Ziel-Chain: BSC; Fork-Deploys via `pnpm contracts:deploy:fork`.
