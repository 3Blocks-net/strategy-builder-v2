---
created: 2026-07-25
last_verified: 2026-07-25
git_commit: 7ca671beafc34c201d4980a6ef66297bec67aa7f
extrahiert: aus-bestandscode
---

# Epic: SIWE-Auth — Sign-In with Ethereum

> **Reverse-Spec aus Bestandscode.** Beschreibt den beobachtbaren Black-Box-Contract (Endpunkte, Fehlercodes, Regeln), belegt durch Code- und Test-Fundstellen. Kein Design-Dokument der ursprünglichen Entwicklung.

## Einseiter

Nutzer melden sich bei Pecunity ohne Passwort an: Sie verbinden ihre Wallet und signieren eine SIWE-Message (EIP-4361), die eine vom Backend ausgegebene Einmal-Nonce enthält. Das Backend verifiziert Signatur, Nonce und Domain, legt beim ersten Login automatisch einen User an (Wallet-Adresse = Identität) und gibt ein Token-Paar zurück: ein JWT-Access-Token (Default 15 min, `ACCESS_TOKEN_EXPIRY`) für Bearer-Auth auf allen geschützten Endpunkten und ein opakes Refresh-Token (Default 7 Tage, `REFRESH_TOKEN_EXPIRY_DAYS`), mit dem das Frontend abgelaufene Access-Tokens still erneuert. Alle Backend-Routen sind per globalem Guard geschützt; nur explizit als `@Public` markierte Routen (Auth-Endpunkte, Health) sind offen. Konsumenten: das React-Frontend (wagmi/viem) und der MCP-Server (`AuthClient`), die beide denselben Handshake `GET /auth/nonce → POST /auth/verify → POST /auth/refresh` fahren.

## Personas & Rollen

| Rolle | Beschreibung | Beleg |
|---|---|---|
| **Wallet-Nutzer (Frontend)** | Endnutzer mit Browser-Wallet; verbindet Wallet, signiert SIWE-Message im Browser, nutzt danach die App mit Bearer-Token aus `localStorage`. | `packages/frontend/src/providers/auth-context.tsx` |
| **MCP-Server (Maschinen-Client)** | Serverseitiger Konsument mit lokalem Keystore-Signer; fährt denselben Handshake headless, hält Tokens nur im Speicher (private Felder, Redaction in `toJSON`/`toString`/`inspect`). | `packages/mcp/src/auth-client.ts` |
| **Backend (Verifier)** | Einzige Instanz, die Nonces ausgibt/entwertet, Signaturen prüft, Tokens signiert und User anlegt. Es gibt keine weiteren Rollen/Berechtigungsstufen — jeder authentifizierte Nutzer ist gleichberechtigt; Autorisierung ist rein „welche Wallet-Adresse steckt im Token". | `packages/backend/src/auth/*` |

## Fachliche Regeln & Verbotsliste (was der Code erzwingt)

**Regeln:**

1. **Nonce ist Single-Use mit TTL.** Ausgabe: 16 Zufallsbytes hex (32 Zeichen), gespeichert mit `expiresAt = now + NONCE_EXPIRY_SECONDS` (Default 300 s). Verbrauch atomar per `updateMany(used=false, expiresAt>now → used=true)`; Treffer-Count 0 ⇒ `401 NONCE_INVALID`. Damit sind abgelaufene, unbekannte und bereits verwendete Nonces identisch abgelehnt. (`auth.service.ts:25-57`)
2. **Domain-Bindung.** Die SIWE-`domain` der Message muss dem Host von `FRONTEND_URL` entsprechen (Default `localhost:5173`); Abweichung ⇒ `401 SIGNATURE_INVALID` — bewusst derselbe Fehlercode wie bei falscher Signatur, kein separates Domain-Leck. (`auth.service.ts:59-74`, `signature.service.ts`, Test „mismatched SIWE domain" in `auth.integration.spec.ts:228-243`)
3. **Nonce-Bindung in der Message.** Die in der SIWE-Message enthaltene Nonce wird zusätzlich von der `siwe`-Library gegen die konsumierte Nonce geprüft (`verify({ nonce })`). (`signature.service.ts:21`)
4. **Chain-agnostisch.** Die `chainId` der SIWE-Message wird nicht geprüft — jede EVM-Chain wird akzeptiert (Test „accepts any EVM chain ID"). (`auth.integration.spec.ts:284-297`)
5. **Identität = checksummed Wallet-Adresse.** `findOrCreate` normalisiert per `ethers.getAddress` (EIP-55) und upserted den User (`walletAddress` unique, `lastLoginAt` bei jedem Login aktualisiert). (`user/user.service.ts`)
6. **Access-Token:** JWT (Passport-JWT, Bearer-Header), Payload `{ sub: walletAddress }`, Secret `JWT_SECRET`, Laufzeit `ACCESS_TOKEN_EXPIRY` (Default `15m`), Expiry wird geprüft (`ignoreExpiration: false`). (`auth.module.ts:18-27`, `jwt.strategy.ts`)
7. **Refresh-Token:** 32 Zufallsbytes hex, opak (kein JWT), serverseitig **nur als SHA-256-Hash** gespeichert, Laufzeit `REFRESH_TOKEN_EXPIRY_DAYS` (Default 7) Tage. (`auth.service.ts:80-98`)
8. **Refresh liefert nur ein neues Access-Token — keine Rotation.** `POST /auth/refresh` gibt `{ accessToken }` zurück; das Refresh-Token bleibt unverändert gültig bis zu seinem `expiresAt` und wird weder rotiert noch beim Ablauf gelöscht. (`auth.service.ts:103-118`)
9. **Global-Guard mit Opt-out.** `WalletAuthGuard` ist als `APP_GUARD` registriert; nur `@Public()`-Routen (u. a. `AuthController` komplett, `/health`) sind ohne Token erreichbar. Fehlercodes differenziert: abgelaufenes JWT ⇒ `401 TOKEN_EXPIRED`, alles andere (fehlend/ungültig) ⇒ `401 UNAUTHORIZED`. (`wallet-auth.guard.ts`, `auth.module.ts:34`)
10. **CORS nur für `FRONTEND_URL`** (mit Credentials). (`main.ts:10-11`)
11. **Frontend-Silent-Refresh-Protokoll:** Genau die Response-Message `TOKEN_EXPIRED` triggert im Frontend einen Refresh-Versuch plus einmaligen Request-Retry; scheitert der Refresh, werden Tokens gelöscht und zum Connect-Screen navigiert. Die Fehlercode-Strings sind damit Teil des Contracts. (`frontend/src/lib/api.ts:24-38`)

**Verbotsliste (der Code verhindert aktiv):**

- ❌ Nonce-Wiederverwendung (Replay) — zweiter `verify` mit derselben Nonce ⇒ `NONCE_INVALID`.
- ❌ Login mit abgelaufener Nonce (älter als `NONCE_EXPIRY_SECONDS`).
- ❌ Signatur einer fremden Wallet über die Message (Adresse ≠ Signer ⇒ `SIGNATURE_INVALID`).
- ❌ SIWE-Message für eine fremde Domain (Phishing-Site kann keine bei ihr signierte Message einlösen).
- ❌ Zugriff auf geschützte Endpunkte ohne/mit ungültigem/abgelaufenem Bearer-Token.
- ❌ Refresh mit unbekanntem oder abgelaufenem Refresh-Token ⇒ `REFRESH_TOKEN_INVALID`.
- ❌ Klartext-Speicherung von Refresh-Tokens serverseitig (nur Hash in DB).
- ❌ Token-Leakage im MCP-Client über Serialisierung/Logging (`toJSON`/`toString`/`inspect` redacted); Fehlertexte spiegeln weder Message noch Signatur zurück (`auth-client.ts:117-120`).

## Anforderungen

### A1 — Nonce beziehen

- **Rolle:** Wallet-Nutzer / MCP-Server (unauthentifiziert)
- **Fähigkeit:** `GET /auth/nonce` liefert `{ nonce: string }` (32 hex-Zeichen).
- **Zweck:** Frische, server-registrierte Challenge für den SIWE-Login; Grundlage des Replay-Schutzes.
- **Fachliche Kriterien:**
  - *Normalfall:* 200, Nonce ist zufällig, wird mit `expiresAt = now + NONCE_EXPIRY_SECONDS` (Default 300) persistiert und ist danach genau einmal einlösbar.
  - *Randfall:* Mehrere parallel geholte Nonces sind unabhängig gültig; eine Nonce ist nicht an eine Adresse oder Session gebunden — Bindung entsteht erst durch die Signatur der Message, die sie enthält.
  - *Fehlerfall:* Keiner spezifiziert; Endpunkt ist öffentlich und parameterlos (kein Rate-Limit im Code).
- **Beleg:** `packages/backend/src/auth/auth.controller.ts:14-19`, `packages/backend/src/auth/auth.service.ts:25-38`, Test `auth.integration.spec.ts:109-127`

### A2 — Login per SIWE-Signatur (Verify)

- **Rolle:** Wallet-Nutzer / MCP-Server (unauthentifiziert)
- **Fähigkeit:** `POST /auth/verify` mit `{ message, signature }` liefert `{ accessToken, refreshToken }` (201).
- **Zweck:** Besitznachweis des Private Keys gegen Nonce+Domain tauschen in ein Sitzungs-Token-Paar; User-Provisionierung nebenbei (kein separater Registrierungs-Flow).
- **Fachliche Kriterien:**
  - *Normalfall:* Gültige EOA-Signatur über eine SIWE-Message mit frischer Nonce und `domain` = Host von `FRONTEND_URL` ⇒ Nonce wird entwertet, User wird angelegt (Erst-Login) bzw. `lastLoginAt` aktualisiert (Wiederkehrer), JWT mit `sub` = checksummed Adresse + opakes Refresh-Token (hash-gespeichert, 7 Tage) zurückgegeben.
  - *Randfälle:* Beliebige EVM-`chainId` akzeptiert; Reihenfolge zählt — die Nonce wird **vor** der Signaturprüfung konsumiert, d. h. auch ein Verify-Versuch mit ungültiger Signatur verbrennt die Nonce.
  - *Fehlerfälle:* Abgelaufene, unbekannte oder bereits benutzte Nonce ⇒ `401 NONCE_INVALID`. Ungültige Signatur, Signer ≠ Message-Adresse oder Domain-Mismatch ⇒ `401 SIGNATURE_INVALID`.
- **Beleg:** `packages/backend/src/auth/auth.service.ts:40-101`, `packages/backend/src/auth/signature.service.ts`, `packages/backend/src/user/user.service.ts`, Tests `auth.integration.spec.ts:129-298`

### A3 — Access-Token erneuern (Refresh)

- **Rolle:** Wallet-Nutzer / MCP-Server (im Besitz eines Refresh-Tokens)
- **Fähigkeit:** `POST /auth/refresh` mit `{ refreshToken }` liefert `{ accessToken }` (201).
- **Zweck:** Kurze Access-Token-Laufzeit (15 min) ohne wiederholte Wallet-Signaturen überbrücken.
- **Fachliche Kriterien:**
  - *Normalfall:* Bekanntes, nicht abgelaufenes Refresh-Token (Lookup per SHA-256-Hash) ⇒ neues JWT für die hinterlegte Wallet-Adresse.
  - *Randfall:* **Keine Rotation** — dasselbe Refresh-Token bleibt bis zu seinem Ablauf beliebig oft nutzbar; es wird kein neues Refresh-Token ausgegeben und das alte nicht entwertet. Jeder Login (A2) erzeugt ein zusätzliches Refresh-Token (mehrere parallel gültig, z. B. Frontend + MCP).
  - *Fehlerfälle:* Unbekanntes (auch: gelöschtes/„revoked") oder abgelaufenes Token ⇒ `401 REFRESH_TOKEN_INVALID`.
- **Beleg:** `packages/backend/src/auth/auth.service.ts:103-118`, Tests `guard-refresh.integration.spec.ts:147-199`

### A4 — Geschützte Endpunkte & Identitäts-Injektion

- **Rolle:** Authentifizierter Nutzer (beliebiger Konsument mit Bearer-Token)
- **Fähigkeit:** Jeder nicht-`@Public`-Endpunkt verlangt `Authorization: Bearer <accessToken>`; die Wallet-Adresse steht dem Handler als `req.user.address` zur Verfügung. `GET /me` liefert `{ address }` als Smoke-Test.
- **Zweck:** Einheitliche, default-sichere Zugriffskontrolle (secure by default: neue Controller sind automatisch geschützt).
- **Fachliche Kriterien:**
  - *Normalfall:* Gültiges JWT ⇒ 200, `address` = `sub`-Claim.
  - *Randfälle:* `@Public`-Routen (`/auth/*`, `/health`) ohne Token erreichbar.
  - *Fehlerfälle:* Abgelaufenes JWT ⇒ `401 TOKEN_EXPIRED` (maschinenlesbares Signal für Silent-Refresh); fehlendes oder ungültiges JWT ⇒ `401 UNAUTHORIZED`.
- **Beleg:** `packages/backend/src/auth/wallet-auth.guard.ts`, `packages/backend/src/auth/jwt.strategy.ts`, `packages/backend/src/auth/me.controller.ts`, `packages/backend/src/auth/public.decorator.ts`, Tests `guard-refresh.integration.spec.ts:88-145`

### A5 — Frontend-Login-Flow (Wallet-Connect + SIWE)

- **Rolle:** Wallet-Nutzer im Browser
- **Fähigkeit:** Nach Wallet-Connect (wagmi) baut `login()` eine SIWE-Message (`domain = window.location.host`, Statement „Sign in to Pecunity", `chainId` aus der Wallet, Fallback 56 prod / 31337 dev, `expirationTime` +5 min), lässt sie signieren, ruft A1+A2 auf und persistiert `accessToken`/`refreshToken`/`walletAddress` in `localStorage`; danach Navigation zum Dashboard.
- **Zweck:** Ein-Klick-Login ohne Passwort; Session überlebt Reloads.
- **Fachliche Kriterien:**
  - *Normalfall:* Signieren ⇒ eingeloggt, Redirect `/dashboard`.
  - *Randfälle:* Session-Restore beim App-Start rein aus `localStorage`-Präsenz (ohne Server-Validierung — ein abgelaufenes Token fällt erst beim ersten API-Call auf und wird dann still refreshed); `login()` ist No-op ohne verbundene Wallet.
  - *Fehlerfälle:* Nutzer lehnt Signatur ab ⇒ Fehlermeldung „Signature rejected. Please try again."; Backend-Fehlermeldung (z. B. `NONCE_INVALID`) wird als Fehlertext angezeigt; `401 TOKEN_EXPIRED` auf beliebigem API-Call ⇒ Silent-Refresh + einmaliger Retry, bei Refresh-Fehlschlag Logout (Storage geleert) + Redirect `/connect`.
- **Beleg:** `packages/frontend/src/providers/auth-context.tsx`, `packages/frontend/src/lib/api.ts`

### A6 — MCP-Auth-Client als zweiter Konsument (Kurzfassung)

- **Rolle:** MCP-Server
- **Fähigkeit:** `AuthClient.authenticate()` fährt denselben Handshake (Nonce → SIWE mit `domain` = Host der konfigurierten `frontendUrl` → verify), `refresh()` erneuert das Access-Token, `authHeader()` liefert den Bearer-Header.
- **Zweck:** Headless-Zugriff des KI-Assistenten auf das Backend mit derselben Wallet-Identität; belegt, dass der Backend-Contract client-agnostisch ist (eigenes Statement, `expirationTime` entfällt — vom Backend nicht verlangt).
- **Fachliche Kriterien:** Tokens nur im Prozess-Speicher (private Felder, Redaction); Fehler ohne Echo von Message/Signatur; `refresh()`/`authHeader()` ohne vorherigen `authenticate()` werfen.
- **Beleg:** `packages/mcp/src/auth-client.ts`

## Out of Scope

- **Logout serverseitig / Token-Revocation:** Es gibt keinen Logout- oder Revoke-Endpunkt; Frontend-Logout löscht nur `localStorage` und trennt die Wallet. Refresh-Tokens bleiben serverseitig bis zum Ablauf gültig.
- **Refresh-Token-Rotation** (bewusst als Nicht-Verhalten dokumentiert, siehe A3).
- **Rollen/Berechtigungen:** kein RBAC, keine Admin-Rolle — Identität ist die einzige Autorisierungs-Dimension.
- **Smart-Contract-Wallets (EIP-1271):** Tests decken nur EOA-Signaturen ab; ob die `siwe`-Library-Verify EIP-1271 hier unterstützt, ist ungeprüft.
- **Rate-Limiting / Brute-Force-Schutz** auf den öffentlichen Auth-Endpunkten.
- **Aufräumen abgelaufener Nonces/Refresh-Tokens** (kein Cleanup-Job im Code gefunden; Zeilen bleiben in der DB).
- **Session-Kopplung Wallet↔App:** Ein Wallet-Wechsel in der Extension invalidiert die Backend-Session nicht automatisch.

## Annahmen & offene Fragen

1. **Keine DTO-Validierung / kein globaler `ValidationPipe`:** `VerifyDto`/`RefreshDto` haben nur Swagger-Decorators. Ein `POST /auth/verify` mit fehlender/unparsebarer `message` lässt `new SiweMessage(message)` in `AuthService.verify` (Zeile 44, via `SignatureService.parse`) **ungefangen werfen** ⇒ vermutlich HTTP 500 statt 400/401. Der `try/catch` in `SignatureService.verify` greift erst nach dem Nonce-Verbrauch. *Offene Frage: gewollt oder Lücke?*
2. **Nonce-Verbrauch vor Signaturprüfung:** Ein Angreifer, der eine fremde (erratene) Nonce in eine selbst signierte Message einsetzt, verbrennt sie und kann so theoretisch fremde Login-Versuche stören (DoS-Miniatur). Bei 128-Bit-Zufallsnonces praktisch irrelevant — als beobachtetes Verhalten dokumentiert, nicht bewertet.
3. **`JWT_SECRET`-Default `dev-secret-change-me`** greift, wenn die Env-Variable fehlt — Annahme: In Produktion wird sie gesetzt (`.env.example` fordert 256-Bit-Hex); der Code erzwingt es nicht (kein Fail-fast).
4. **Fehlercode-Strings sind API-Contract:** `NONCE_INVALID`, `SIGNATURE_INVALID`, `REFRESH_TOKEN_INVALID`, `TOKEN_EXPIRED`, `UNAUTHORIZED` — das Frontend matcht wörtlich auf `TOKEN_EXPIRED`. Annahme: Diese Strings dürfen nicht ohne Frontend-/MCP-Anpassung geändert werden.
5. **SIWE-`expirationTime`:** Das Frontend setzt +5 min, der MCP-Client gar keine. Ob das Backend (via `siwe`-Library-Default `verify`) eine abgelaufene `expirationTime` ablehnt, ist nicht durch eigene Tests belegt — Annahme: Library-Verhalten, ungeprüfter Contract-Rand.
6. **`FRONTEND_URL` doppelt belegt** (CORS-Origin **und** SIWE-Domain-Quelle): Multi-Domain-Deployments (z. B. Staging + Prod auf einer API) sind mit genau einer Domain nicht abbildbar — Annahme: bewusste Vereinfachung.
7. **Frontend-Session-Restore ohne Validierung** (A5): `isAuthenticated` wird allein aus `localStorage`-Präsenz abgeleitet; UI kann kurzzeitig „eingeloggt" zeigen, obwohl beide Tokens abgelaufen sind. Erst der erste API-Call korrigiert das. *Offene Frage: akzeptierter UX-Trade-off?*
