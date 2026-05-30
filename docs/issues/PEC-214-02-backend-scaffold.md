# PEC-214-02: Backend Scaffold + Prisma Database

## Parent PRD

PEC-214 — [PRD: Wallet-Authentifizierung](../PRD-PEC-214-wallet-auth.md)

## What to build

Scaffold a NestJS application in `packages/backend` with Prisma ORM connecting to PostgreSQL. Set up Docker Compose with two PostgreSQL services (dev and test). Create the Prisma schema with User, Nonce, and RefreshToken tables as defined in the PRD. Implement DatabaseModule exposing PrismaService as a global provider. Configure environment variables via `.env` with a corresponding `.env.example`.

The backend should start successfully, connect to PostgreSQL, and run Prisma migrations. A simple health endpoint (`GET /health`) verifies the app is reachable.

## Acceptance criteria

- [ ] NestJS app in `packages/backend/` starts with `pnpm --filter backend dev`
- [ ] Prisma schema defines `User` (id UUID, walletAddress unique checksummed, createdAt, lastLoginAt), `Nonce` (id, nonce unique, createdAt, expiresAt, used boolean), `RefreshToken` (id, tokenHash, walletAddress, expiresAt, createdAt)
- [ ] `prisma migrate dev` creates tables in PostgreSQL
- [ ] Docker Compose defines `db` (dev, port 5432) and `db-test` (test, port 5433) PostgreSQL services
- [ ] DatabaseModule provides PrismaService globally
- [ ] `GET /health` returns 200
- [ ] `.env.example` documents all required variables (DATABASE_URL, JWT_SECRET, ACCESS_TOKEN_EXPIRY, REFRESH_TOKEN_EXPIRY_DAYS, FRONTEND_URL, NONCE_EXPIRY_SECONDS, PORT)
- [ ] Backend test runner configured (Jest) and can connect to test database

## Blocked by

- Blocked by PEC-214-01 (Monorepo Migration)

## User stories addressed

- User story 19 (JWT secrets via environment variables)
