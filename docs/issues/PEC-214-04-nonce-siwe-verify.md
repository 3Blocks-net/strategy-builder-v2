# PEC-214-04: Nonce + SIWE Verify Endpoints

## Parent PRD

PEC-214 — [PRD: Wallet-Authentifizierung](../PRD-PEC-214-wallet-auth.md)

## What to build

Implement the core authentication endpoints in AuthModule: `GET /auth/nonce` (generate and store a cryptographically random, time-limited nonce) and `POST /auth/verify` (validate nonce, parse SIWE message, verify EOA signature, find-or-create User, issue JWT access token + refresh token).

Implement SignatureService within AuthModule for EOA-only verification using the `siwe` npm package. Implement UserModule with `findOrCreate(walletAddress)` that creates a new User or updates `lastLoginAt` on returning users.

Validate the SIWE message `domain` field against the hostname derived from `FRONTEND_URL` to prevent phishing. Nonces are single-use — mark as used atomically via a single UPDATE with `WHERE used = false`.

## Acceptance criteria

- [ ] `GET /auth/nonce` returns a nonce string and stores it in the database with an expiry (configurable via `NONCE_EXPIRY_SECONDS`)
- [ ] `POST /auth/verify` with valid EOA signature returns `{ accessToken, refreshToken }` with correct JWT claims (`sub` = checksummed address, 15-min expiry)
- [ ] Refresh token stored hashed in RefreshToken table
- [ ] `POST /auth/verify` with expired nonce returns 401 `NONCE_INVALID`
- [ ] `POST /auth/verify` with reused nonce returns 401 `NONCE_INVALID`
- [ ] `POST /auth/verify` with invalid signature returns 401 `SIGNATURE_INVALID`
- [ ] `POST /auth/verify` with mismatched SIWE domain returns 401 `SIGNATURE_INVALID`
- [ ] First-time login creates a User record with walletAddress and lastLoginAt
- [ ] Repeat login updates `lastLoginAt` on existing User
- [ ] Authentication is chain-agnostic (accepts any EVM chain ID)
- [ ] SignatureService unit tests: EOA recovery returns correct address; invalid signature returns different address
- [ ] Integration tests cover all acceptance criteria above

## Blocked by

- Blocked by PEC-214-02 (Backend Scaffold + Prisma Database)

## User stories addressed

- User story 2 (sign SIWE message to prove ownership)
- User story 3 (receive JWT after signing)
- User story 10 (chain-agnostic authentication)
- User story 15 (single-use, time-limited nonces)
- User story 17 (auto-create User on first login)
- User story 18 (update lastLoginAt on each auth)
