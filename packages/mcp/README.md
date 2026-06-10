# Pecunity MCP-Server

Steuert die DeFi-Vaults **deiner eigenen Wallet** per KI-Assistent (z. B. Claude Desktop).
Der Server läuft **lokal** über stdio, signiert server-seitig in deinem Namen und operiert
ausschließlich auf den Vaults genau einer authentifizierten Owner-Adresse.

> **Self-Custody:** Dein Private Key verlässt nie diesen Rechner und wird nie geloggt oder
> an das Sprachmodell weitergegeben. Geldbewegende Aktionen erfordern eine explizite
> Bestätigung (ab den Schreib-Slices).

## Voraussetzungen

- Node.js ≥ 22, `pnpm`
- Ein **verschlüsselter JSON-Keystore** (Web3 Secret Storage) deiner Wallet
- OS-Keychain: macOS Keychain / Windows Credential Manager / Linux libsecret

## Build

```bash
pnpm --filter mcp build
```

## 1. Onboarding — Keystore-Passwort im OS-Keychain hinterlegen

Das Keystore-Passwort wird **einmalig interaktiv** im OS-Keychain hinterlegt — nie auf der
Platte, insbesondere **nicht** in `claude_desktop_config.json`:

```bash
pnpm --filter mcp run init
# oder nach globaler Installation:  pecunity-mcp-init
```

Zum **Trennen/Entfernen** des Zugangs (löscht das Passwort aus dem Keychain):

```bash
pecunity-mcp-init --remove
```

## 2. Registrierung in Claude Desktop

In `claude_desktop_config.json` (Claude Desktop → Settings → Developer):

```jsonc
{
  "mcpServers": {
    "pecunity": {
      "command": "node",
      "args": ["/ABSOLUTER/PFAD/zu/packages/mcp/dist/index.js"],
      "env": {
        "PECUNITY_BACKEND_URL": "https://api.pecunity.example",
        "PECUNITY_FRONTEND_URL": "https://app.pecunity.example",
        "PECUNITY_KEYSTORE_PATH": "/sicherer/pfad/keystore.json",
        "PECUNITY_CHAIN_ID": "56",
        "PECUNITY_KEYCHAIN_ACCOUNT": "default",
        "PECUNITY_READ_ONLY": "false"
      }
    }
  }
}
```

> Das **Passwort** steht bewusst **nicht** hier — es kommt aus dem OS-Keychain (Schritt 1).

Beim Start zeigt der Server einen **Sicherheitshinweis** (er kann in deinem Namen signieren,
wie du den Zugang entziehst) auf stderr an und verbindet sich per SIWE mit dem Backend.

### Tools

**Auth / Identität**
- `whoami` — verbundene Owner-Adresse.

**Lesen / Discovery** (owner-isoliert, bestätigungsfrei)
- `list_vaults` — alle Vaults der Adresse (Adresse, Label, Deposit-Token).
- `get_vault` — ein Vault inkl. Gas-Deposit-Stand.
- `get_portfolio` — Token-Bestände mit USD-Werten.
- `list_automations` — Automations (aktiv/pausiert, owner-only/public, Schrittzahl).
- `get_executions` — Verlauf: Runs, Deposits/Withdraws, dekodierte Fehlschläge (`Step N: <reason>`).
- `get_positions` — DeFi-Positionssicht (idle + Gas-Reserve + Aave/PancakeSwap-Positionen + Netto-Equity).
- `get_performance` — PnL vs. Einzahlungen + Kosten (`range: 24h|7d|30d|all`).
- `get_value_history` — USD-Wertverlauf + Deposit/Withdraw-Marker (`range`).

**Katalog**
- `list_step_types` — deployte Bausteine (Conditions + Actions).
- `describe_step_type` — `paramSchema` (JSON-Schema-treu) + gelesene/geschriebene Kontext-Slots.

> Schreibende/geldbewegende Tools (Vault erstellen, deposit/withdraw, Automations
> deployen) folgen in späteren Slices und laufen dann durch ein erzwungenes Confirm-Gate.

## Konfiguration (Env)

| Variable | Pflicht | Bedeutung |
| --- | --- | --- |
| `PECUNITY_BACKEND_URL` | ja | Basis-URL des Pecunity-Backends |
| `PECUNITY_FRONTEND_URL` | ja | Frontend-URL; ihr Host ist die SIWE-`domain` |
| `PECUNITY_KEYSTORE_PATH` | ja | Pfad zum verschlüsselten JSON-Keystore |
| `PECUNITY_CHAIN_ID` | nein (56) | Chain-ID (BSC mainnet) |
| `PECUNITY_KEYCHAIN_ACCOUNT` | nein (`default`) | Keychain-Account-Schlüssel |
| `PECUNITY_READ_ONLY` | nein (`false`) | deaktiviert (ab Schreib-Slices) alle write/signing-Tools |

## Manuelles Testen mit dem MCP Inspector

Der [MCP Inspector](https://github.com/modelcontextprotocol/inspector) startet eine lokale
Web-UI, in der du die Tools des Servers (z. B. `whoami`) manuell aufrufen kannst.

```bash
# baut zuerst und startet dann den Inspector gegen dist/index.js
pnpm --filter mcp inspect
```

> **Voraussetzung:** Der Server **authentifiziert sich beim Start** gegen das Backend
> (Owner-Session). Damit `whoami` antwortet, müssen ein erreichbares Backend, ein gültiger
> Keystore und das Keychain-Passwort (Schritt 1) vorhanden sein — sonst beendet sich der
> Server mit einer klaren Fehlermeldung auf stderr.

Env-Variablen mitgeben (zwei Wege):

```bash
# (a) per Shell-Export vor dem Start
export PECUNITY_BACKEND_URL=http://localhost:3000
export PECUNITY_FRONTEND_URL=http://localhost:5173
export PECUNITY_KEYSTORE_PATH=/sicherer/pfad/keystore.json
pnpm --filter mcp inspect
```

Oder **(b)** direkt in der Inspector-UI unter *Environment Variables* setzen und dort
„Connect" klicken. Anschließend in der UI: *Tools → whoami → Run*.

## ⚠️ Quick-Start aus einem rohen Private Key — NUR zum Ausprobieren

> **Nicht der Standard und nicht für echtes Vermögen.** Der sichere Weg ist ein
> verschlüsselter Keystore (oben). Der rohe Private Key ist hier ausschließlich als
> markiertes Schnellstart-Beispiel dokumentiert: erzeuge daraus einen Keystore und nutze
> dann wieder den normalen Pfad.

```bash
# Erzeugt aus einem rohen Private Key einen verschlüsselten Keystore.
# Beispiel: Hardhat-Test-Account #0 (öffentlich bekannt, NIE echtes Vermögen).
RAW_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
KEYSTORE_PASSWORD=pecunity-dev \
OUT=~/.pecunity/keystore.json \
node packages/mcp/scripts/make-keystore.mjs
# → schreibt ~/.pecunity/keystore.json (Adresse 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266)

# Danach Passwort im Keychain hinterlegen und registrieren:
pecunity-mcp-init                 # dasselbe Passwort eingeben (pecunity-dev)
# PECUNITY_KEYSTORE_PATH=~/.pecunity/keystore.json in der Config setzen (siehe oben).
```

Ein direkter Runtime-Pfad für rohe Keys ist **nicht** vorgesehen (out of scope).

## Sicherheit

- Private Key / Keystore-Passwort erscheinen nie in Logs, Fehlern oder Tool-Ausgaben.
- Genau **eine** Owner-Session; alle Tools sind an ihre Adresse gebunden — Fremd-Vault-Zugriff
  ist unmöglich.
- SIWE-Authentifizierung server-seitig gegen das bestehende Backend
  (`/auth/nonce` → `/auth/verify` → `/auth/refresh`), Frontend-Host als `domain`.
