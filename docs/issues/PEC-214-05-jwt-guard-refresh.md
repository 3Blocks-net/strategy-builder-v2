# PEC-214-05: JWT Guard + Refresh Token Endpoint

## Parent PRD

PEC-214 — [PRD: Wallet-Authentifizierung](../PRD-PEC-214-wallet-auth.md)

## What to build

Implement WalletAuthGuard using Passport JWT strategy that protects all endpoints outside `/auth/*`. The guard extracts the JWT from the `Authorization: Bearer <token>` header, validates it, and injects the wallet address into the request context. Implement `POST /auth/refresh` that validates a refresh token (exists, not expired, not revoked) and issues a new access token. Configure CORS to restrict origins to `FRONTEND_URL` only. On logout (refresh token deletion), the server-side token record is removed for real session invalidation.

## Acceptance criteria

- [ ] WalletAuthGuard applied globally, excludes `/auth/*` and `/health`
- [ ] Request without Authorization header returns 401 `UNAUTHORIZED`
- [ ] Request with expired JWT returns 401 `TOKEN_EXPIRED`
- [ ] Request with valid JWT succeeds and wallet address is available in request context
- [ ] `POST /auth/refresh` with valid refresh token returns new `{ accessToken }`
- [ ] `POST /auth/refresh` with expired refresh token returns 401 `REFRESH_TOKEN_INVALID`
- [ ] `POST /auth/refresh` with revoked (deleted) refresh token returns 401 `REFRESH_TOKEN_INVALID`
- [ ] CORS configured to accept only `FRONTEND_URL` origin
- [ ] Integration tests cover all acceptance criteria above

## Blocked by

- Blocked by PEC-214-04 (Nonce + SIWE Verify Endpoints)

## User stories addressed

- User story 6 (silent session renewal via refresh token)
- User story 7 (re-sign prompt on expired refresh token)
- User story 14 (WalletAuthGuard protects API endpoints)
- User story 19 (JWT secrets via environment variables)
