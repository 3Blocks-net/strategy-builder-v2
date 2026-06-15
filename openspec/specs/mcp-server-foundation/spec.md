# mcp-server-foundation Specification

## Purpose
TBD - created by archiving change add-mcp-server. Update Purpose after archive.
## Requirements
### Requirement: MCP-Server-Paket (stdio)

Das System SHALL ein pnpm-Workspace-Paket `packages/mcp` bereitstellen, das über das offizielle MCP SDK per stdio-Transport läuft und in Claude Desktop per command/stdio registrierbar ist.

#### Scenario: Registrierung in Claude Desktop

- **WHEN** ein Nutzer der dokumentierten Konfiguration folgt und den Server in Claude Desktop einträgt
- **THEN** startet der Server headless über stdio und ist als MCP-Server verbunden

### Requirement: Wallet-Zugang über Keystore + OS-Keychain

Das System SHALL den Wallet-Zugang aus einem verschlüsselten JSON-Keystore laden, dessen Passwort aus dem OS-Keychain (macOS Keychain / Windows Credential Manager / Linux libsecret) gelesen wird. Das Passwort SHALL über einen einmaligen interaktiven Init/Onboarding-CLI-Command in den Keychain geschrieben werden. Der rohe Private Key SHALL nur als ausdrücklich gekennzeichnetes Quick-Start-Beispiel dokumentiert sein, nicht als Standard.

#### Scenario: Init-CLI hinterlegt Passwort

- **WHEN** der Nutzer den Init/Onboarding-Command in einem echten Terminal ausführt
- **THEN** wird das Keystore-Passwort in den OS-Keychain geschrieben und die Runtime liest es zur Laufzeit headless

#### Scenario: Owner-Adresse wird abgeleitet

- **WHEN** der Server mit gültigem Keystore startet
- **THEN** leitet der `WalletSigner` die Owner-Adresse ab, ohne Key-Material nach außen zu reichen

### Requirement: Kein Key-Leak

Das System SHALL weder Private Key noch Keystore-Passwort in Logs, Fehlern oder Tool-Ausgaben an das LLM ausgeben.

#### Scenario: Erzwungener Fehlerpfad

- **WHEN** ein Fehler im Signing-/Auth-Pfad ausgelöst wird
- **THEN** enthält die Fehlermeldung weder Key-Fragmente noch das Passwort noch einen rohen Stacktrace

### Requirement: SIWE-Authentifizierung (server-seitig)

Das System SHALL sich per `AuthClient` gegen das bestehende Backend authentifizieren: `GET /auth/nonce` → `SiweMessage` (Frontend-Host als `domain`) mit dem Wallet-Key signieren → `POST /auth/verify` → Access-/Refresh-JWT speichern → `POST /auth/refresh` bei Ablauf. Backend-seitig SHALL keine Änderung nötig sein (keine SIWE-Domain-Allowlist).

#### Scenario: Voller SIWE-Handshake gegen gemocktes Backend

- **WHEN** der `AuthClient` gegen ein gemocktes Backend läuft
- **THEN** durchläuft er nonce → SIWE bauen+signieren → verify → JWT speichern, verwendet den Frontend-Host als `domain` und refresht das JWT bei Ablauf

### Requirement: Owner-Session-Isolation

Das System SHALL genau eine authentifizierte Owner-Session halten; alle Tools SHALL ausschließlich im Kontext dieser Owner-Adresse operieren. Zugriff auf fremde Vaults SHALL unmöglich sein.

#### Scenario: whoami liefert verbundene Adresse

- **WHEN** der Nutzer das Tool `whoami` aufruft
- **THEN** gibt der Server die korrekt abgeleitete Owner-Adresse zurück

### Requirement: Sichere Fehler- und Lifecycle-UX

Das System SHALL bei fehlendem/ungültigem Wallet-Zugang eine klare, sichere Fehlermeldung (kein Stacktrace, keine Key-Fragmente) liefern, beim ersten Verbinden einen deutlichen Sicherheitshinweis zeigen und einen dokumentierten Weg zum Trennen/Entfernen des Zugangs bereitstellen.

#### Scenario: Ungültiger Zugang

- **WHEN** kein gültiger Wallet-Zugang vorhanden ist
- **THEN** erhält der Nutzer eine klare, sichere Fehlermeldung ohne sensible Fragmente

#### Scenario: Erst-Verbindungs-Hinweis

- **WHEN** der Nutzer den Server zum ersten Mal verbindet
- **THEN** wird ein Sicherheitshinweis angezeigt (Server kann in seinem Namen signieren, wie der Zugang entzogen wird)

