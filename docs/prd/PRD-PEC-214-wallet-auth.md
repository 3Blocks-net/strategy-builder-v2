# PRD: Wallet-Authentifizierung (MetaMask + SIWE)

**Epic:** PEC-214
**Status:** Draft
**Date:** 2026-05-30

---

## Problem Statement

DeFi investors cannot currently authenticate with the Pecunity platform. Without authentication, there is no way to associate on-chain vaults with their owners, protect API endpoints, or provide personalized vault management. Users with existing MetaMask wallets expect to use their on-chain identity to log in — without email registration or passwords — and the platform currently offers no mechanism for this.

## Solution

Implement wallet-based authentication using the SIWE (Sign-In with Ethereum) standard. Users connect their MetaMask wallet, sign a structured SIWE message, and receive a short-lived access token (JWT) plus a longer-lived refresh token. The backend verifies EOA signatures via `ecrecover`. A minimal authenticated dashboard displays the connected wallet address.

The authentication system is chain-agnostic — it accepts any EVM chain ID in the SIWE message, supporting BSC Mainnet, BSC Testnet, and future chains without code changes.

Account Kit (Social Login / embedded wallets) and ERC-1271 smart contract wallet support (Safe) are explicitly deferred to follow-up epics.

## User Stories

1. As a DeFi investor, I want to connect my MetaMask wallet to the platform, so that I can identify myself without creating an account.

2. As a connected user, I want to sign a SIWE message to prove wallet ownership, so that the platform can trust my identity without holding my private key.

3. As an authenticated user, I want to receive a JWT after signing, so that subsequent API requests are authenticated without re-signing.

4. As an authenticated user, I want my JWT stored in the browser, so that refreshing the page doesn't require re-authentication within the token's lifetime.

5. As an authenticated user, I want to see my wallet address displayed on the dashboard, so that I can confirm which wallet is connected.

6. As a user with an expired access token, I want my session to be silently renewed via a refresh token, so that I don't have to re-sign with MetaMask every 15 minutes.

7. As a user with an expired refresh token, I want to be prompted to re-sign a SIWE message, so that my session is renewed securely.

8. As an authenticated user, I want to disconnect (logout) from the platform, so that my session ends and I'm redirected to the connect page.

9. As an unauthenticated user, I want to be redirected to the connect page when accessing protected routes, so that I understand I need to authenticate first.

10. As a user connecting from BSC Testnet, I want authentication to work regardless of which EVM chain I'm on, so that I can test without switching networks.

11. As a user without MetaMask installed, I want to see a clear message explaining that MetaMask is required, so that I understand what's needed to proceed.

12. As a user whose MetaMask popup is blocked by the browser, I want to see an error message with guidance, so that I can resolve the issue and retry.

13. As a user who rejects the SIWE signature in MetaMask, I want to remain on the connect page with the option to retry, so that accidental rejections don't lock me out.

14. As a backend developer, I want all API endpoints protected by a WalletAuthGuard, so that unauthenticated requests are rejected with a 401 status.

15. As a backend developer, I want SIWE nonces to be single-use and time-limited, so that replay attacks are prevented.

16. As a backend developer, I want the auth module to be isolated from business logic, so that swapping to Account Kit later doesn't require rewriting endpoint guards.

17. As a first-time user, I want a User record created automatically upon first login, so that my wallet address is persisted for future features (preferences, profiles).

18. As a returning user, I want my last login timestamp updated on each authentication, so that the platform can track session activity.

19. As an operator, I want JWT secrets configured via environment variables, so that secrets are never hardcoded and environments are easily switched.

## Implementation Decisions

### Monorepo Structure

The project adopts pnpm workspaces. The existing Hardhat smart contracts move into `packages/contracts`. Two new packages are added: `packages/backend` (NestJS) and `packages/frontend` (Vite + React). A root `pnpm-workspace.yaml` defines the workspace. Shared TypeScript configuration and tooling live at the root level.

The root `package.json` provides convenience scripts that delegate to packages via `pnpm --filter`, e.g. `pnpm --filter contracts test`. Each package manages its own `.env` file (with a corresponding `.env.example`).

### Backend Architecture (NestJS)

Three NestJS modules compose the backend:

**AuthModule** — Owns the authentication flow. Exposes three endpoints:
- `GET /auth/nonce` — Generates a cryptographically random nonce, stores it in the database with an expiry (e.g. 5 minutes), and returns it to the client.
- `POST /auth/verify` — Receives the SIWE message and signature. Validates the nonce (exists, not expired, not used), verifies the EOA signature via `SignatureService` (internal service within AuthModule), finds-or-creates the User record, and returns both an access token (15-min expiry) and a refresh token (7-day expiry). The refresh token is stored in the database (hashed).
- `POST /auth/refresh` — Receives a refresh token. Validates it (exists, not expired, not revoked), issues a new access token, and returns it.

The module provides a `WalletAuthGuard` (NestJS guard using Passport JWT strategy) that protects all endpoints outside of `/auth/*`. The guard extracts the JWT from the `Authorization: Bearer <token>` header, validates it, and injects the wallet address into the request context.

The `SignatureService` is an internal service within AuthModule (not a separate module). It performs EOA-only verification: recovers the signer address from the SIWE message hash and signature using standard `ecrecover` (via the `siwe` npm package). ERC-1271 smart contract wallet verification is deferred to a later epic. The service can be extracted into its own module when additional verification strategies (ERC-1271, passkeys) are needed.

The SIWE `domain` field is validated against the hostname derived from `FRONTEND_URL` to prevent phishing attacks.

**UserModule** — Manages the `User` entity via Prisma. The entity stores: `id` (UUID), `walletAddress` (unique, checksummed), `createdAt`, `lastLoginAt`. The service provides `findOrCreate(walletAddress)` which either returns an existing user or creates a new one, updating `lastLoginAt` in both cases.

**DatabaseModule** — Prisma client configuration. Connects to PostgreSQL via `DATABASE_URL` environment variable. Exposes `PrismaService` as a global provider.

### Frontend Architecture (Vite + React)

The frontend is a single-page application built with Vite + React, styled with Tailwind CSS and shadcn/ui components. Routing is handled by React Router with a `ProtectedRoute` wrapper for authenticated pages.

**WalletProvider** — A component wrapping the app with wagmi's `WagmiProvider` and TanStack Query's `QueryClientProvider`. Configures a minimal wagmi config with the `injected()` connector only (MetaMask). No transports or on-chain reads are needed in this epic.

**AuthContext** — A React context provider managing:
- Access token and refresh token storage in `localStorage`
- A shared fetch wrapper (used with TanStack Query) that attaches `Authorization: Bearer <token>` to all API requests
- Silent refresh: when a request returns 401 with `TOKEN_EXPIRED`, automatically calls `POST /auth/refresh` with the stored refresh token, retries the request with the new access token, and updates localStorage
- State: `isAuthenticated`, `address`, `isLoading`
- Methods: `login()` (triggers SIWE flow), `logout()` (clears tokens, disconnects wagmi, redirects to `/connect`)
- Automatic redirect to `/connect` when both tokens are missing or refresh fails

**SIWE Flow (client-side)**:
1. Call `GET /auth/nonce` to get a fresh nonce
2. Construct the SIWE message with: domain (`window.location.host`), address, nonce, chainId, issued-at, expiration, statement
3. Prompt the user to sign via wagmi's `signMessage`
4. Send message + signature to `POST /auth/verify`
5. Store returned access token and refresh token in localStorage, update AuthContext state

**Pages** (React Router):
- `/connect` — Public page. Shows a "Connect Wallet" button. On connect, triggers the SIWE signing flow. On success, redirects to `/dashboard`.
- `/dashboard` — Protected page (via `ProtectedRoute`). Displays connected wallet address (truncated with copy button). Redirects to `/connect` if not authenticated. Vault list is deferred to the subgraph epic.

### Authentication Flow (End-to-End)

```
Browser                         Backend
  │                                │
  ├─ GET /auth/nonce ─────────────>│
  │<──────────── { nonce } ────────┤
  │                                │
  ├─ Construct SIWE message        │
  ├─ MetaMask: signMessage() ──>   │
  │<──── signature ────────────    │
  │                                │
  ├─ POST /auth/verify ──────────>│
  │   { message, signature }       ├─ Validate nonce
  │                                ├─ Parse SIWE message
  │                                ├─ Validate domain against FRONTEND_URL
  │                                ├─ ecrecover → match?
  │                                ├─ Find or create User
  │                                ├─ Issue access token (15m)
  │                                ├─ Issue refresh token (7d, stored hashed)
  │<── { accessToken, refreshToken }┤
  │                                │
  ├─ Store tokens in localStorage  │
  ├─ Redirect to /dashboard        │
  │                                │
  │  ... access token expires ...  │
  │                                │
  ├─ POST /auth/refresh ─────────>│
  │   { refreshToken }             ├─ Validate refresh token
  │                                ├─ Issue new access token (15m)
  │<──────── { accessToken } ──────┤
  │                                │
  ├─ Update localStorage           │
```

### JWT Claims (Access Token)

```json
{
  "sub": "0x1234...abcd",
  "iat": 1717056000,
  "exp": 1717056900
}
```

- `sub`: Checksummed wallet address (EIP-55)
- `iat` / `exp`: Issued-at and expiry (15 minutes)

### Environment Variables

**Backend** (`packages/backend/.env`):

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/pecunity` |
| `JWT_SECRET` | Secret for signing JWTs | `<random 256-bit hex>` |
| `ACCESS_TOKEN_EXPIRY` | Access token lifetime | `15m` |
| `REFRESH_TOKEN_EXPIRY_DAYS` | Refresh token lifetime in days | `7` |
| `FRONTEND_URL` | CORS origin + SIWE domain source | `http://localhost:5173` |
| `NONCE_EXPIRY_SECONDS` | SIWE nonce TTL | `300` |
| `PORT` | Backend server port | `3001` |

**Frontend** (`packages/frontend/.env`):

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API base URL | `http://localhost:3001` |

### Error Handling

| Scenario | Frontend Behavior | Backend Response |
|----------|-------------------|------------------|
| MetaMask not installed | Show "Install MetaMask" message with link | N/A |
| User rejects signature | Show "Signature rejected, try again" | N/A |
| Popup blocked | Show "Please allow popups" guidance | N/A |
| Invalid/expired nonce | Show "Session expired, please retry" | `401 { error: "NONCE_INVALID" }` |
| Signature verification failed | Show "Signature invalid" | `401 { error: "SIGNATURE_INVALID" }` |
| Expired access token | Silent refresh via refresh token | `401 { error: "TOKEN_EXPIRED" }` |
| Expired/invalid refresh token | Redirect to /connect | `401 { error: "REFRESH_TOKEN_INVALID" }` |
| Missing Authorization header | Auto-redirect to /connect | `401 { error: "UNAUTHORIZED" }` |

### SIWE Nonce Management

Nonces are stored in a PostgreSQL table with columns: `id`, `nonce` (unique), `createdAt`, `expiresAt`, `used` (boolean). On verification, the nonce is marked as used atomically (single UPDATE with WHERE used = false). Expired nonces are cleaned up periodically via a cron job.

### Security Considerations

- **Nonce replay prevention**: Each nonce is single-use and time-limited (default 5 minutes). The atomic UPDATE prevents race conditions.
- **SIWE message validation**: The `domain` field in the SIWE message must match the hostname derived from `FRONTEND_URL` to prevent phishing.
- **JWT secret rotation**: The `JWT_SECRET` should be a strong random value. Rotation requires restarting the backend (acceptable for MVP; a key-rotation mechanism can be added later).
- **CORS**: The backend restricts CORS to `FRONTEND_URL` only (configured via NestJS CORS).
- **Refresh token security**: Refresh tokens are stored hashed in the database. On logout, the refresh token is deleted server-side, providing real session invalidation. A leaked access token is valid for at most 15 minutes.
- **Token storage**: Both access and refresh tokens are stored in `localStorage`. This is an accepted XSS risk for MVP simplicity.

## Testing Decisions

### What Makes a Good Test

Tests should verify external behavior through the public API/UI, not implementation details. A good test answers: "Does this feature work correctly from the user's/caller's perspective?" Tests should not depend on internal method names, database column names, or module wiring — only on inputs, outputs, and observable side effects.

### Backend Tests (NestJS — Jest)

**Integration tests for AuthModule** — the highest-value test surface:
- `GET /auth/nonce` returns a valid nonce string and stores it in the database
- `POST /auth/verify` with a valid EOA signature returns an access token and refresh token with correct claims
- `POST /auth/verify` with an expired nonce returns 401
- `POST /auth/verify` with a reused nonce returns 401
- `POST /auth/verify` with an invalid signature returns 401
- `POST /auth/verify` with a mismatched SIWE domain returns 401
- `POST /auth/refresh` with a valid refresh token returns a new access token
- `POST /auth/refresh` with an expired refresh token returns 401
- `POST /auth/refresh` with a revoked (logged-out) refresh token returns 401
- A request to a protected endpoint without a JWT returns 401
- A request to a protected endpoint with a valid JWT succeeds and injects the wallet address
- A request with an expired JWT returns 401
- First-time login creates a User record; repeat login updates `lastLoginAt`

**Unit tests for SignatureService**:
- EOA signature recovery returns the correct address
- EOA signature recovery returns a different address for an invalid signature

### Frontend Tests (Vitest + React Testing Library)

**Component and integration tests**:
- AuthContext: login flow stores tokens in localStorage and sets authenticated state
- AuthContext: logout clears tokens and resets state
- AuthContext: silent refresh on expired access token updates stored token
- AuthContext: failed refresh clears state and triggers redirect
- ProtectedRoute: redirects to `/connect` when not authenticated
- ProtectedRoute: renders children when authenticated
- Connect page: renders connect button
- Dashboard page: displays truncated wallet address

Playwright E2E tests are deferred to a later epic when the UI has more substance.

### Test Infrastructure

- Backend tests use a real PostgreSQL instance via a dedicated Docker container (separate from the local dev database)
- Frontend component tests run via Vitest with wagmi mocked at the connector level
- Docker Compose defines two PostgreSQL services: one for local development, one for tests
- Prior art for smart contract tests exists in `packages/contracts/test/` (Hardhat + ethers.js)

## Out of Scope

- **Account Kit / Social Login** — deferred to a separate follow-up epic as stated in PEC-214
- **ERC-1271 smart contract wallet verification (Safe)** — deferred to a follow-up epic; EOA-only for MVP
- **Vault list on dashboard** — deferred to the Goldsky subgraph epic; dashboard shows wallet address only
- **Playwright E2E tests** — deferred until the UI has more substance; Vitest + React Testing Library for now
- **Multi-wallet support** — only one wallet connected at a time
- **User profile editing** — the User entity is auto-created, no UI for editing profile data
- **Role-based access control (RBAC)** — all authenticated users have the same permissions
- **Rate limiting** — no rate limiting on auth endpoints for MVP (should be added before production)
- **Vault creation/management UI** — vault management is a separate feature
- **Mobile wallet support (WalletConnect)** — MetaMask browser extension only for MVP
- **Email/notification integration** — no notifications on login events
- **httpOnly cookie token storage** — tokens stored in localStorage; accepted XSS risk for MVP

## Further Notes

- The `siwe` npm package (maintained by Spruce/Sign-In with Ethereum) should be used for SIWE message parsing and verification on the backend, rather than implementing the EIP-4361 spec manually.
- The monorepo migration (moving contracts into `packages/contracts`) should be done as the first step, with a separate commit, to keep the diff clean and ensure existing Hardhat tests continue to pass.
- The Prisma schema should be set up with migrations from the start (`prisma migrate dev`) to establish good database versioning practices.
- The wagmi configuration should use `createConfig` with the `injected()` connector only. No transports or on-chain reads are needed in this epic.
- The Prisma schema includes three tables: `User` (`id`, `walletAddress`, `createdAt`, `lastLoginAt`), `Nonce` (`id`, `nonce`, `createdAt`, `expiresAt`, `used`), and `RefreshToken` (token hash, `walletAddress`, `expiresAt`, `createdAt`).
