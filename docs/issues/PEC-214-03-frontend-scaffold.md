# PEC-214-03: Frontend Scaffold + Connect Page

## Parent PRD

PEC-214 — [PRD: Wallet-Authentifizierung](../PRD-PEC-214-wallet-auth.md)

## What to build

Scaffold a Vite + React SPA in `packages/frontend` with Tailwind CSS, shadcn/ui, and React Router. Configure wagmi with a minimal config using the `injected()` connector only (MetaMask). Build the `/connect` page with a "Connect Wallet" button that triggers MetaMask connection. Handle error states: MetaMask not installed (show install message with link), popup blocked (show guidance), and signature rejected (show retry option).

This slice delivers the frontend shell and the first user-facing page. No SIWE signing or backend communication yet — only wallet connection via wagmi.

## Acceptance criteria

- [ ] Vite + React app in `packages/frontend/` starts with `pnpm --filter frontend dev`
- [ ] Tailwind CSS and shadcn/ui configured and working
- [ ] React Router with `/connect` and `/dashboard` routes defined
- [ ] WalletProvider wraps app with wagmi's WagmiProvider and TanStack QueryClientProvider
- [ ] wagmi config uses `createConfig` with `injected()` connector only
- [ ] `/connect` page renders "Connect Wallet" button
- [ ] Clicking "Connect Wallet" triggers MetaMask connection popup
- [ ] When MetaMask is not installed: shows "Install MetaMask" message with link
- [ ] When user rejects connection: shows retry option
- [ ] `.env.example` documents `VITE_API_URL`
- [ ] Vitest configured with React Testing Library
- [ ] Component test: Connect page renders connect button

## Blocked by

- Blocked by PEC-214-01 (Monorepo Migration)

## User stories addressed

- User story 1 (connect MetaMask wallet)
- User story 11 (MetaMask not installed message)
- User story 12 (popup blocked guidance)
- User story 13 (signature rejected, retry option)
