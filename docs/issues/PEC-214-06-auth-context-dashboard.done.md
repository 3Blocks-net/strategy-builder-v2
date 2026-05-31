# PEC-214-06: Auth Context + Dashboard (End-to-End Flow)

## Parent PRD

PEC-214 — [PRD: Wallet-Authentifizierung](../PRD-PEC-214-wallet-auth.md)

## What to build

Wire the frontend to the backend for the complete SIWE authentication flow. Implement AuthContext managing token storage, API authentication, and session lifecycle. Build the `/dashboard` page and ProtectedRoute wrapper.

**AuthContext** provides:
- Access + refresh token storage in `localStorage`
- A shared fetch wrapper attaching `Authorization: Bearer <token>` to all API requests
- Silent refresh: on 401 with `TOKEN_EXPIRED`, call `POST /auth/refresh`, retry the original request, update localStorage
- State: `isAuthenticated`, `address`, `isLoading`
- `login()`: fetch nonce → construct SIWE message → sign via wagmi `signMessage` → POST verify → store tokens → redirect to `/dashboard`
- `logout()`: clear tokens, disconnect wagmi, redirect to `/connect`

**SIWE client flow**: construct message with domain, address, nonce, chainId, issued-at, expiration, statement. Sign via wagmi.

**ProtectedRoute**: redirects to `/connect` when not authenticated.

**Dashboard**: displays truncated wallet address with copy button. Redirects to `/connect` if not authenticated.

## Acceptance criteria

- [ ] `login()` completes full SIWE flow: nonce → sign → verify → tokens stored in localStorage → redirect to `/dashboard`
- [ ] Access and refresh tokens stored in `localStorage` and attached to API requests via Bearer header
- [ ] Silent refresh: expired access token triggers automatic `POST /auth/refresh`, retries failed request with new token
- [ ] Failed refresh (expired/revoked refresh token): clears tokens, redirects to `/connect`
- [ ] `logout()` clears localStorage tokens, disconnects wagmi, redirects to `/connect`
- [ ] Page refresh with valid tokens in localStorage restores authenticated state without re-signing
- [ ] ProtectedRoute redirects unauthenticated users to `/connect`
- [ ] ProtectedRoute renders children for authenticated users
- [ ] `/dashboard` displays truncated wallet address (e.g. `0x1234...abcd`)
- [ ] `/dashboard` has copy-to-clipboard button for full wallet address
- [ ] SIWE message includes correct domain, chainId, nonce, issued-at, and expiration
- [ ] Frontend tests: login stores tokens + sets state, logout clears state, silent refresh updates token, failed refresh redirects, ProtectedRoute behavior, dashboard displays address

## Blocked by

- Blocked by PEC-214-04 (Nonce + SIWE Verify Endpoints)
- Blocked by PEC-214-05 (JWT Guard + Refresh Token Endpoint)
- Blocked by PEC-214-03 (Frontend Scaffold + Connect Page)

## User stories addressed

- User story 3 (receive JWT after signing)
- User story 4 (JWT stored in browser, survives page refresh)
- User story 5 (wallet address displayed on dashboard)
- User story 8 (disconnect/logout)
- User story 9 (redirect to connect page for protected routes)
- User story 10 (chain-agnostic — chainId from connected wallet)
