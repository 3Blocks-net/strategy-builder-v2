# MCP-Spine + SIWE-Auth + `whoami`

## Parent PRD

mcp-integration.md

## What to build

Der erste Tracer-Bullet für das ganze Epic: das neue Workspace-Paket `packages/mcp`
(stdio, offizielles MCP SDK, viem) steht, ein Nutzer registriert es in Claude Desktop,
verbindet sich mit seiner Wallet und fragt „mit welcher Adresse bin ich verbunden?".

Etabliert die von allen späteren Slices genutzte Infrastruktur:

- **`WalletSigner` (deep module):** verschlüsselter JSON-Keystore; Passwort aus dem
  **OS-Keychain** (macOS/Windows/Linux), hinterlegt über einen einmaligen interaktiven
  **Init/Onboarding-CLI-Command**. Leitet die Owner-Adresse ab; Key-Material wird nie nach
  außen gereicht und nie geloggt. Siehe PRD _Wallet-Zugang_.
- **`AuthClient` (deep module):** `GET /auth/nonce` → `SiweMessage` (Frontend-Host als
  `domain`) → signiert mit Keystore-Key → `POST /auth/verify` → Access-/Refresh-JWT,
  `POST /auth/refresh` bei Ablauf. **Keine** Backend-Änderung (Allowlist gestrichen). Siehe
  PRD _Authentifizierung (SIWE, server-seitig)_.
- **Owner-Session:** genau eine authentifizierte Session; alle künftigen Tools binden an
  deren Adresse.
- **Tool `whoami`:** liefert die verbundene Owner-Adresse.
- **Sicherheits-/Lifecycle-UX:** Erst-Verbindungs-Sicherheitshinweis + dokumentierter Weg
  zum Trennen/Entfernen des Zugangs.

## Acceptance criteria

- [ ] `packages/mcp` ist ein pnpm-Workspace-Paket (stdio, MCP SDK) und in Claude Desktop per command/stdio registrierbar (dokumentiert).
- [ ] Init-CLI schreibt das Keystore-Passwort in den OS-Keychain; Runtime liest es headless.
- [ ] `AuthClient` führt den vollen SIWE-Handshake gegen ein **gemocktes Backend** durch (nonce → SIWE bauen+signieren → verify → JWT speichern/refreshen); korrekte Domain (Frontend-Host).
- [ ] **Kein Key-Leak:** weder Key noch Passwort erscheinen in Logs, Fehlern oder Tool-Ausgaben (Test mit erzwungenem Fehlerpfad).
- [ ] `whoami` gibt die korrekte abgeleitete Owner-Adresse zurück.
- [ ] Fehlender/ungültiger Wallet-Zugang → klare, sichere Fehlermeldung (kein Stacktrace, keine Key-Fragmente).
- [ ] Erst-Verbindungs-Sicherheitshinweis + dokumentierter Trenn-/Entfern-Weg vorhanden.

## Blocked by

None - can start immediately.

## User stories addressed

- User story 1
- User story 2
- User story 3
- User story 4
- User story 5
- User story 6
- User story 7
- User story 8
- User story 9
- User story 10
