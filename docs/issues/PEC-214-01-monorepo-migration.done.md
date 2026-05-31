# PEC-214-01: Monorepo Migration

## Parent PRD

PEC-214 — [PRD: Wallet-Authentifizierung](../PRD-PEC-214-wallet-auth.md)

## What to build

Restructure the project from a flat Hardhat repository into a pnpm monorepo with workspaces. Move all existing smart contract code (contracts, tests, ignition modules, Hardhat config, types) into `packages/contracts`. Set up root-level pnpm workspace configuration and convenience scripts. The existing Hardhat compile and test commands must continue to work unchanged from within `packages/contracts`.

This is a pure structural migration with no new functionality — the only success criterion is that the codebase is reorganized and all existing tests pass.

## Acceptance criteria

- [ ] `pnpm-workspace.yaml` at project root defines `packages/*`
- [ ] Root `package.json` uses pnpm with workspace convenience scripts (e.g. `pnpm --filter contracts test`)
- [ ] All Solidity contracts, test files, ignition modules, Hardhat config, and TypeScript config are under `packages/contracts/`
- [ ] `npm` lockfile removed, `pnpm-lock.yaml` generated
- [ ] `npx hardhat compile` works from `packages/contracts/`
- [ ] `npx hardhat test` works from `packages/contracts/` — all existing tests pass
- [ ] Root `.gitignore` updated for monorepo structure
- [ ] `CLAUDE.md` updated to reflect new paths and commands
- [ ] Each package has its own `.env.example` where applicable

## Blocked by

None - can start immediately

## User stories addressed

Infrastructure slice — enables all subsequent issues. No user stories directly addressed.
