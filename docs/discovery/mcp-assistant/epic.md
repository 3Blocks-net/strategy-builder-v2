---
created: 2026-07-25
last_verified: 2026-07-25
git_commit: 7ca671beafc34c201d4980a6ef66297bec67aa7f
extrahiert: aus-bestandscode
---

# Epic — mcp-assistant (Reverse-Spec aus Bestandscode)

> Rekonstruiert aus `packages/mcp/src` (Quellcode + `*.test.ts` als Verhaltens-Belege), gegengelesen mit den eingefrorenen Legacy-Specs `docs/legacy-specs/mcp-*`. Contract-Beschreibung, keine Implementierungs-Vorgabe. **Security-Konvention:** Key-Material/Secrets werden hier nicht zitiert.

## Einseiter

Der Pecunity-MCP-Server (`pecunity-mcp`) ist ein lokaler stdio-MCP-Server, der einem KI-Assistenten (MCP-Client, z. B. Claude Desktop) die Verwaltung der DeFi-Vaults **genau einer** Owner-Wallet erlaubt. Beim Start entschlüsselt er den lokalen JSON-Keystore (Passwort headless aus dem OS-Keychain, Service `pecunity-mcp`), leitet die Owner-Adresse ab und authentifiziert sich per SIWE gegen das Backend; alle Tools operieren ausschließlich auf Vaults dieser Adresse. Lese-Tools (Vaults, Portfolio, Positionen, Performance, Executions, Step-Katalog, Recipes) sind frei nutzbar. Schreibende/signierende Tools laufen durch einen zentralen **PolicyGate**: Read-only-Modus blockiert alle Writes; sensible Aktionen (Vault anlegen, Deposit, Withdraw, sensibler Automation-Deploy, Automation reaktivieren) erfordern eine explizite, server-vermittelte Nutzer-Bestätigung — primär per MCP-Elicitation, bei strukturell fehlender Client-Unterstützung per lokaler Bestätigungsseite mit einmaligem Zufalls-Token. Die Freigabe ist server-interner Zustand; es existiert kein Pfad, über den das LLM sie via Tool-Argumente erteilen kann. Jede Write-Aktion wird in ein lokales append-only Audit-Log geschrieben. Das Automation-Bauen ist zweigeteilt (propose → validierter, unveränderlicher Draft mit ID; deploy → nimmt nur die Draft-ID) mit Intent-Cross-Check, Adress-Allowlist und Capability-Opt-in. Ein Init-CLI (`pnpm --filter mcp run init`) verifiziert das Keystore-Passwort vor dem Speichern im Keychain und bietet mit `--remove` den Widerrufspfad.

## Personas & Rollen

| Rolle | Beschreibung | Beleg |
|---|---|---|
| **Vault-Owner (Nutzer)** | Self-Custody-Besitzer der Wallet. Führt das Onboarding aus, konfiguriert den Server (Env in `claude_desktop_config.json`), bestätigt oder verweigert jede sensible Aktion im Confirm-Dialog. Einzige Instanz, die Freigaben erteilen kann. | `packages/mcp/src/cli/init.ts`, `packages/mcp/src/confirmation.ts` |
| **KI-Assistent (LLM / MCP-Client)** | Ruft die MCP-Tools auf. Wird als **nicht vertrauenswürdig** behandelt: kann Argumente liefern, aber keine Freigaben erteilen, keine rohen TX-Daten bestimmen, keine Drafts verändern. | `packages/mcp/src/policy-gate.ts`, `packages/mcp/src/wallet-signer.ts` (`Trusted<T>`-Markierung) |
| **Backend (Pecunity-API)** | Datenquelle und Validierungsinstanz: owner-gefilterte Vault-Daten, Step-Katalog, Encode-Boundary (`/encode`), akzeptierte Tokens, Fees. Erzwingt Owner-Isolation per 403. | `packages/mcp/src/backend-client.ts` |
| **Betreiber-Konfiguration** | Dieselbe Person wie der Owner, in der Rolle „Policy-Setzer": Read-only-Modus, Adress-Allowlist, Capability-Opt-in, Max-Beträge pro Token — alles per Env-Variablen. | `packages/mcp/src/config.ts` |

## Fachliche Regeln & Verbotsliste (vom Code erzwungen)

1. **Kein Signieren ohne Bestätigung bei sensiblen Aktionen.** Sensible Aktionen blockieren synchron auf dem ConfirmationProvider; Timeout oder fehlende Bestätigungsmöglichkeit ist ein hartes Fail („es wurde nicht signiert"). Beleg: `packages/mcp/src/policy-gate.ts`.
2. **Die Freigabe ist server-interner Zustand.** Kein Tool-Argument kann eine Bestätigung ausdrücken; im Fallback-Pfad ist die Freigabe an einen einmaligen 32-Byte-Zufalls-Token gebunden, der nur auf stderr (nie in den LLM-sichtbaren stdout/MCP-Kanal) ausgegeben wird. Beleg: `packages/mcp/src/confirmation.ts` (`PendingApprovals`, `#renderUrl`).
3. **Read-only-Modus blockiert jede schreibende Aktion** noch vor der Bestätigungsfrage; die Ablehnung wird auditiert. Beleg: `packages/mcp/src/policy-gate.ts`.
4. **Geld-Ziele nur aus der Adress-Allowlist.** `withdraw`-Empfänger und Empfänger-Felder in Automations (schema-getrieben über die Rolle `recipient`) müssen in der lowercased Allowlist stehen; die Owner-Adresse ist immer enthalten. Leere Empfänger-Felder sind ein harter Reject. Belege: `packages/mcp/src/tools/money-movement.ts`, `packages/mcp/src/tools/deploy-automation.ts`, `packages/mcp/src/index.ts`.
5. **Sensible Step-Types nur mit Capability-Opt-in** (`PECUNITY_ENABLED_SENSITIVE_STEPS`); ohne Opt-in ist der Step „nicht verbaubar". Beleg: `packages/mcp/src/tools/deploy-automation.ts`.
6. **Max-Betrag pro Token** (`PECUNITY_MAX_AMOUNT_PER_TOKEN`) wird in Base-Units (BigInt) geprüft — kein Float-Schlupfloch. Gilt für deposit, withdraw und Gas-Top-up. Beleg: `packages/mcp/src/token-utils.ts` (`checkMax`).
7. **Nur eigene Vaults.** Vor jeder signierenden Geld-/Lifecycle-Aktion wird geprüft, dass der Ziel-Vault der verbundenen Adresse gehört; Backend-403 wird als Owner-Isolation-Fehler übersetzt. Belege: `packages/mcp/src/vault-guard.ts`, `packages/mcp/src/backend-client.ts` (`ForbiddenVaultError`).
8. **Deploy signiert exakt den gespeicherten Entwurf.** `deploy_automation` nimmt nur die Draft-ID; der Draft ist zwischen propose und deploy nicht veränderbar (kein Update-Pfad), einmalig konsumierbar (kein Replay) und läuft nach 10 Minuten ab. Geprüft wird gegen den im Draft eingefrorenen Katalog-Snapshot (Katalog-Drift kann Sensibilitäts-Erkennung nicht aushebeln). Belege: `packages/mcp/src/draft-store.ts`, `packages/mcp/src/tools/deploy-automation.ts`.
9. **Keine LLM-kontrollierten TX-Daten.** Der Signer akzeptiert nur als `Trusted<T>` markierte TX-Anfragen; `to`/`data`/`functionName`/`args` dürfen nie direkt aus LLM-/User-Input stammen. Beleg: `packages/mcp/src/wallet-signer.ts` (`trustTx`).
10. **Key-Material und Secrets werden nie geleakt.** Signer/AuthClient redigieren `toJSON`/`toString`/`inspect`; Entschlüsselungs- und Auth-Fehler enthalten keine Passwort-/Key-/Signatur-Fragmente; das Startskript gibt bei Fehlern nur die Message ohne Stacktrace aus. Belege: `packages/mcp/src/wallet-signer.ts`, `packages/mcp/src/auth-client.ts`, `packages/mcp/src/index.ts` (main-catch).
11. **Confirm-Summaries kommen aus server-decodierten Daten,** nicht aus LLM-Argumenten; LLM-kontrollierte Freitexte (Vault-Label) werden für die Summary entschärft (Zeilenumbrüche entfernt, auf 64 Zeichen gekappt). Belege: `packages/mcp/src/tools/deploy-automation.ts` (`formatSummary` aus dem Draft), `packages/mcp/src/tools/create-vault.ts`.
12. **Fallback-Bestätigungsseite ist gehärtet:** nur Loopback-Host (DNS-Rebinding-Abwehr, sonst 403), Freigeben/Ablehnen nur per POST (keine passive Navigation), Token einmalig einlösbar, Timeout 120 s. Beleg: `packages/mcp/src/confirmation.ts`.
13. **Elicitation-Timeout ist kein Fallback-Grund.** Nur strukturelle „Client unterstützt Elicitation nicht"-Fehler leiten auf die lokale Seite um; Timeout/Validierungsfehler propagieren als hartes Fail. Belege: `packages/mcp/src/index.ts` (`isElicitationUnsupported`), `packages/mcp/src/confirmation.ts` (`CompositeConfirmationProvider`).
14. **Jede Write-Aktion wird auditiert** (append-only JSONL, lokal, Default `~/.pecunity/audit.log`): Outcomes `requested`/`approved`/`denied`/`timeout`/`rejected`/`success`/`error`, inkl. TX-Hash. Belege: `packages/mcp/src/audit-log.ts`, `packages/mcp/src/policy-gate.ts`.
15. **Verify-before-store im Onboarding:** Das Keystore-Passwort wird erst nach erfolgreicher Entschlüsselung des Keystores in den Keychain geschrieben; bei falschem Passwort wird nichts gespeichert. Rohe Private Keys werden bewusst nicht first-class eingelesen. Beleg: `packages/mcp/src/onboarding.ts`.
16. **Nur Katalog-Bausteine und kuratierte Tokens.** Unbekannte Step-Types und Tokens ohne bekannte Decimals brechen `propose_automation` bzw. Geld-Tools hart ab — vor jeder TX. Belege: `packages/mcp/src/tools/propose-automation.ts`, `packages/mcp/src/token-utils.ts` (`decimalsOf`).

## Anforderungen

### A1 — Onboarding per Init-CLI (verify-before-store)

- **Rolle:** Vault-Owner
- **Fähigkeit:** Über `pnpm --filter mcp run init` (bzw. `pecunity-mcp-init` nach globalem Link) das Keystore-Passwort sicher im OS-Keychain hinterlegen.
- **Zweck:** Headless-Start des Servers ohne Passwort auf der Platte oder in `claude_desktop_config.json`.
- **Fachliche Kriterien:**
  - *Normalfall:* CLI fragt Keystore-Pfad (Env `PECUNITY_KEYSTORE_PATH` oder interaktiv) und Passwort (maskiert), entschlüsselt den Keystore probeweise, speichert das Passwort erst nach Erfolg im Keychain (Service `pecunity-mcp`, Account aus `PECUNITY_KEYCHAIN_ACCOUNT`, Default `default`), gibt Owner-Adresse und einen Config-Schnipsel (ohne Passwort) aus.
  - *Randfall:* `--remove` löscht den Keychain-Eintrag und meldet, ob einer existierte (Widerrufspfad).
  - *Fehlerfälle:* Kein Pfad → Abbruch Exit 1; Keystore-Datei nicht lesbar → Fehler mit Pfad-Hinweis, nichts gespeichert; falsches Passwort → Fehler „es wurde NICHTS im Keychain gespeichert"; leeres Passwort → Abbruch.
- **Beleg:** `packages/mcp/src/cli/init.ts`, `packages/mcp/src/onboarding.ts`, `packages/mcp/src/keychain.ts`, Tests `packages/mcp/src/onboarding.test.ts`

### A2 — Server-Start, Owner-Session & SIWE-Auth

- **Rolle:** Vault-Owner (implizit beim Start durch den MCP-Client)
- **Fähigkeit:** Der Server baut beim Start genau eine authentifizierte Owner-Session auf und bindet alle Tools an diese Adresse.
- **Zweck:** Owner-Isolation und Self-Custody: Der Schlüssel bleibt lokal, das Backend kennt nur die SIWE-Session.
- **Fachliche Kriterien:**
  - *Normalfall:* Passwort aus Keychain → Keystore entschlüsseln → Adresse ableiten → SIWE-Handshake (`/auth/nonce` → `/auth/verify`, Domain = Host der `PECUNITY_FRONTEND_URL`); Sicherheitshinweis und „Verbunden als <Adresse>" auf stderr (stdout gehört dem MCP-Kanal).
  - *Randfälle:* Abgelaufener Access-Token wird bei Backend-Calls einmalig per Refresh-Token erneuert und der Call wiederholt; Token-Objekte sind gegen Serialisierung/Inspection redigiert.
  - *Fehlerfälle:* Kein Keychain-Eintrag → Startabbruch mit Hinweis auf `pecunity-mcp-init`; Keystore nicht lesbar → Startabbruch mit Pfad-Hinweis; falsches Passwort/beschädigter Keystore → sichere Fehlermeldung ohne Fragmente; Backend nicht erreichbar/HTTP-Fehler → „Backend nicht erreichbar"/„Authentifizierung fehlgeschlagen (HTTP <Status>)" ohne Response-Echo. Fehlende Pflicht-Env (`PECUNITY_BACKEND_URL`, `PECUNITY_FRONTEND_URL`, `PECUNITY_KEYSTORE_PATH`) → Startabbruch mit Nennung des Keys.
- **Beleg:** `packages/mcp/src/session.ts`, `packages/mcp/src/auth-client.ts`, `packages/mcp/src/config.ts`, `packages/mcp/src/security-notice.ts`, Tests `packages/mcp/src/session.test.ts`, `packages/mcp/src/auth-client.test.ts`

### A3 — Read-Tools: Vault-Einsicht

- **Rolle:** KI-Assistent (für den Owner)
- **Fähigkeit:** `whoami`, `list_vaults`, `get_vault`, `get_portfolio`, `list_automations`, `get_executions` (mit Filter/Paging), `get_positions` (optional `refresh`), `get_performance`, `get_value_history` (Zeitbereiche `24h|7d|30d|all`).
- **Zweck:** Der Assistent kann Fragen zu Beständen, Automations, Historie und PnL beantworten, ohne je zu schreiben.
- **Fachliche Kriterien:**
  - *Normalfall:* Ergebnisse als eingerückter JSON-Text; alle Tools als read-only annotiert; Daten kommen ausschließlich von owner-gefilterten Backend-Endpunkten.
  - *Randfall:* `get_executions` liefert getrennt Runs, Transfers und dekodierte Fehlschläge („Step N: <reason>").
  - *Fehlerfall:* Zugriff auf fremden Vault → Backend-403 wird als klarer Fehler „Vault <addr> gehört nicht zur verbundenen Adresse" gemeldet (kein Daten-Leak).
- **Beleg:** `packages/mcp/src/index.ts` (Tool-Registrierung), `packages/mcp/src/tools/read-tools.ts`, `packages/mcp/src/tools/whoami.ts`, `packages/mcp/src/backend-client.ts`, Tests `packages/mcp/src/read-tools.test.ts`

### A4 — Read-Tools: Baustein-Katalog & Recipes

- **Rolle:** KI-Assistent
- **Fähigkeit:** `list_step_types` (deployte Conditions/Actions), `describe_step_type` (paramSchema mit Defaults, Rollen, Kontext-Slots), `list_recipes` (kuratierte Beispiel-Graph-Shapes ohne Adressen).
- **Zweck:** Der Assistent assembliert Automations nur aus real deployten Bausteinen und orientiert sich an guten Graph-Formen (Few-Shot).
- **Fachliche Kriterien:**
  - *Normalfall:* Katalog spiegelt den tatsächlich deployten Stand des Backends.
  - *Randfall:* Recipes enthalten stabile Step-Type-Namen als Platzhalter, keine konkreten Adressen.
- **Beleg:** `packages/mcp/src/tools/catalog-tools.ts`, `packages/mcp/src/tools/recipe-tools.ts`, Tests `packages/mcp/src/catalog-tools.test.ts`, `packages/mcp/src/recipe-tools.test.ts`

### A5 — Automation vorschlagen ohne Deploy (`propose_automation`)

- **Rolle:** KI-Assistent
- **Fähigkeit:** Aus einem friendly-Graphen + deklariertem Intent einen validierten, server-intern gespeicherten Entwurf erzeugen — ohne zu signieren.
- **Zweck:** Trennung von „bauen/prüfen" und „signieren": Das, was der Nutzer bestätigt, ist exakt das, was deployt wird.
- **Fachliche Kriterien:**
  - *Normalfall:* Pipeline: (1) nur Katalog-Step-Types, (2) friendly→raw über die shared Encode-Boundary (`mapGraphToRaw`), (3) Pool-Existenz-Check für Swap-Nodes (PancakeSwap-Factory), (4) Backend-`/encode`-Validierung (liefert `ownerOnly`), (5) server-seitiger Decode + Intent-Cross-Check, (6) Ablage im Draft-Store (TTL 10 min) → Rückgabe Draft-ID + decodierte Summary + Warnungen.
  - *Randfälle:* Verzweigte Graphen sind nicht voll cross-checkbar → Warnung statt Reject; Intent-Felder, die im Graph fehlen (z. B. kein Betrag decodierbar), werden nicht gedifft.
  - *Fehlerfälle (jeweils Reject mit Erklärung, kein Deploy):* unbekannter Step-Type; nicht-kuratierter Token (unbekannte Decimals); nicht existenter Pool; Encode-Boundary-Ablehnung (Backend-Draft wird best-effort aufgeräumt); Intent ≠ server-decodierter Graph (Diff-Liste: execution, Action-Anzahl/Token/Betrag/Richtung, Trigger-Periode).
- **Beleg:** `packages/mcp/src/tools/propose-automation.ts`, `packages/mcp/src/intent-check.ts`, `packages/mcp/src/summary-decoder.ts`, `packages/mcp/src/draft-store.ts`, Tests `packages/mcp/src/propose-automation.test.ts`, `packages/mcp/src/intent-check.test.ts`, `packages/mcp/src/summary-decoder.test.ts`, `packages/mcp/src/draft-store.test.ts`

### A6 — Automation deployen (`deploy_automation`)

- **Rolle:** KI-Assistent (Ausführung), Vault-Owner (Freigabe)
- **Fähigkeit:** Einen mit `propose_automation` erzeugten Entwurf per Draft-ID on-chain deployen.
- **Zweck:** Signiert wird ausschließlich der gespeicherte, validierte Graph — das LLM kann zwischen Vorschau und Deploy nichts verändern.
- **Fachliche Kriterien:**
  - *Normalfall:* Draft wird einmalig konsumiert; schema-getriebene Prüfung gegen den Katalog-Snapshot des Drafts (Empfänger-Rollen → Allowlist, sensible Steps → Capability-Opt-in); bei Sensibilität Confirm-Gate mit Summary aus dem gespeicherten Entwurf (inkl. Owner-only/Public-Kennzeichnung); Ergebnis: On-Chain-Automation-ID + TX-Hashes.
  - *Randfälle:* Nicht-sensible Automations deployen confirm-frei (aber auditiert, Read-only wird respektiert); verzweigte Graphen tragen in der Confirm-Summary die Warnung „NICHT voll cross-checkbar".
  - *Fehlerfälle:* Unbekannte/benutzte/abgelaufene Draft-ID → Fehler mit Hinweis, `propose_automation` erneut auszuführen; leerer oder nicht-allowlisteter Empfänger → harter Reject vor dem Gate; sensibler Step ohne Opt-in → „nicht verbaubar"; Nutzer lehnt ab / Timeout → PolicyError, nicht signiert.
- **Beleg:** `packages/mcp/src/tools/deploy-automation.ts`, `packages/mcp/src/draft-store.ts`, Tests `packages/mcp/src/deploy-automation.test.ts`

### A7 — Vault erstellen (`create_vault`)

- **Rolle:** KI-Assistent (Ausführung), Vault-Owner (Freigabe)
- **Fähigkeit:** Einen neuen Vault mit Deposit-Token und optionalem Label anlegen.
- **Zweck:** Vault-Lifecycle vollständig aus dem Assistenten heraus starten.
- **Fachliche Kriterien:**
  - *Normalfall:* Deposit-Token wird vor jeder TX gegen die akzeptierten Tokens (FeeRegistry via Backend) geprüft; sensible Aktion → Confirm-Gate; nach Sign+Send wird der Vault im Backend registriert; Rückgabe Vault-Adresse + TX-Hash.
  - *Randfälle:* Label wird für die Confirm-Summary entschärft (Zeilenumbrüche raus, 64 Zeichen); Tool ist nur registriert, wenn `PECUNITY_RPC_URL` und `PECUNITY_FACTORY_ADDRESS` gesetzt sind (sonst stderr-Hinweis).
  - *Fehlerfälle:* Nicht akzeptierter Token → Reject vor dem Gate; Ablehnung/Timeout → nicht signiert; Backend-Registrierung schlägt nach erfolgreicher On-Chain-Erstellung fehl → Fehler macht den Teil-Zustand explizit (Adresse + TX + manueller Wiederholungs-Hinweis).
- **Beleg:** `packages/mcp/src/tools/create-vault.ts`, `packages/mcp/src/index.ts`, Tests `packages/mcp/src/create-vault.test.ts`

### A8 — Geldbewegungen (`deposit`, `withdraw`)

- **Rolle:** KI-Assistent (Ausführung), Vault-Owner (Freigabe)
- **Fähigkeit:** Token-Beträge (human units) in eigene Vaults einzahlen bzw. an Allowlist-Empfänger auszahlen.
- **Zweck:** Geld bewegen im Dialog — mit denselben Schutzschichten wie im Frontend, plus explizite Einzel-Bestätigung.
- **Fachliche Kriterien:**
  - *Normalfall:* Reihenfolge: Vault-Ownership-Check → Decimals-Auflösung (nur kuratierte Tokens) → Max-Betrag-Check → Base-Units-Konvertierung → Confirm-Gate (sensibel) mit transparenter Fee-Zeile (BPS aus `/fees`; bei Deposit inkl. Hinweis auf mögliche einmalige ERC20-Freigabe) → Sign+Send → TX-Hash.
  - *Randfälle:* Fee-Endpoint nicht erreichbar → Summary sagt „Gebühr unbekannt" (kein Abbruch); Owner ist immer implizit in der Empfänger-Allowlist.
  - *Fehlerfälle:* Fremder Vault → Reject vor dem Signieren; nicht-kuratierter Token → Reject; Betrag über Max-Limit → Reject mit Hinweis „separate Freigabe nötig"; Withdraw-Empfänger nicht in Allowlist → Reject vor dem Gate; Ablehnung/Timeout im Gate → PolicyError, nicht signiert.
- **Beleg:** `packages/mcp/src/tools/money-movement.ts`, `packages/mcp/src/vault-guard.ts`, `packages/mcp/src/token-utils.ts`, Tests `packages/mcp/src/money-movement.test.ts`, `packages/mcp/src/vault-guard.test.ts`

### A9 — Dry-Run (`simulate_action`)

- **Rolle:** KI-Assistent
- **Fähigkeit:** Gas- und Fee-Schätzung für deposit/withdraw ohne zu senden und ohne Bestätigung.
- **Zweck:** Kosten vorab transparent machen, bevor der Nutzer eine echte Aktion freigibt.
- **Fachliche Kriterien:**
  - *Normalfall:* Liefert Base-Units-Betrag, Fee-Zeile und Gas-Schätzung; als read-only annotiert.
  - *Fehlerfall:* `type=withdraw` ohne gültige `recipient`-Adresse → Fehler.
  - *Bewusste Grenze:* Für `deploy_automation` gibt es keine Ergebnis-Simulation (echtes Feuern zeigt nur ein Fork).
- **Beleg:** `packages/mcp/src/tools/money-movement.ts` (`simulateAction`), Tests `packages/mcp/src/money-movement.test.ts`

### A10 — Lifecycle-Tools (`top_up_gas_deposit`, `set_min_fee_deposit`, `set_automation_active`)

- **Rolle:** KI-Assistent (Ausführung), Vault-Owner (Freigabe nur beim Reaktivieren)
- **Fähigkeit:** Gas-Reserve auffüllen, Auto-Top-up-Ziel setzen, Automations aktivieren/pausieren.
- **Zweck:** Risikoärmere Betriebs-Writes ohne Bestätigungs-Reibung, aber mit vollem Gate-/Audit-Pfad.
- **Fachliche Kriterien:**
  - *Normalfall:* Alle drei laufen durch das PolicyGate als **nicht-sensibel** (confirm-frei, aber auditiert; Read-only blockiert); Vault-Ownership wird vor dem Signieren geprüft; Top-up respektiert das Max-Limit pro Token.
  - *Randfall (asymmetrische Sensibilität):* `set_automation_active` mit `active=true` (Reaktivieren) ist **sensibel** und erfordert Bestätigung — eine bewusst pausierte Automation darf nicht still wieder anlaufen (z. B. via Prompt-Injection); Pausieren (`active=false`) bleibt confirm-frei.
  - *Fehlerfälle:* Fremder Vault, nicht-kuratierter Token, Limit-Überschreitung → Reject vor dem Signieren.
- **Beleg:** `packages/mcp/src/tools/lifecycle.ts`, Tests `packages/mcp/src/lifecycle.test.ts`

### A11 — PolicyGate & Confirm-Ablauf (Querschnitt)

- **Rolle:** Vault-Owner (einzige Freigabe-Instanz)
- **Fähigkeit:** Jede sensible Aktion einzeln freigeben oder ablehnen; jede Write-Aktion nachvollziehen.
- **Zweck:** Server-erzwungener Signing-Chokepoint — die Sicherheitsgarantie des gesamten Features.
- **Fachliche Kriterien:**
  - *Normalfall:* Primärer Confirm-Pfad ist MCP-Elicitation (Timeout 120 s; nur `accept` mit `confirm: true` gilt als Freigabe — `decline`/`cancel`/alles andere ist Ablehnung). Nach Freigabe wird ausgeführt und das Ergebnis (`success`/`error`, TX-Hash) auditiert.
  - *Randfall (Fallback):* Unterstützt der Client Elicitation strukturell nicht, öffnet der Server eine lokale Bestätigungsseite (127.0.0.1, zufälliger Port): einmaliger 64-Hex-Token in der URL (nur stderr), Freigabe/Ablehnung nur per POST, fremde Host-Header → 403, benutzter/unbekannter Token → „Token ungültig oder bereits benutzt"; SIGINT/SIGTERM schließen den Listener.
  - *Fehlerfälle:* Read-only-Modus → PolicyError vor jeder Bestätigung (auditiert als `rejected`); Ablehnung → PolicyError „Aktion abgelehnt — es wurde nicht signiert" (`denied`); Timeout/keine Bestätigungsmöglichkeit → PolicyError „Keine Bestätigung erhalten … es wurde nicht signiert" (`timeout`); Elicitation-Timeout fällt **nicht** auf die lokale Seite zurück.
- **Beleg:** `packages/mcp/src/policy-gate.ts`, `packages/mcp/src/confirmation.ts`, `packages/mcp/src/index.ts` (`isElicitationUnsupported`), Tests `packages/mcp/src/policy-gate.test.ts`, `packages/mcp/src/confirmation.test.ts`

### A12 — Audit-Log

- **Rolle:** Vault-Owner
- **Fähigkeit:** Lokales, append-only Protokoll aller Write-Aktionen einsehen (Default `~/.pecunity/audit.log`, überschreibbar per `PECUNITY_AUDIT_LOG_PATH`).
- **Zweck:** Nachvollziehbarkeit jeder (versuchten) Signatur — self-custody-konsistent als lokale Datei.
- **Fachliche Kriterien:**
  - *Normalfall:* Eine JSON-Zeile pro Ereignis: Timestamp (ISO), Tool, Parameter, Summary, Outcome (`requested|approved|denied|timeout|rejected|success|error`), optional TX-Hash/Detail; Verzeichnis wird bei Bedarf angelegt.
  - *Randfall:* Auch abgelehnte/fehlgeschlagene Aktionen hinterlassen Einträge (Reject im Read-only-Modus, Denied, Timeout, Ausführungsfehler).
  - *Invariante:* Aufrufer reichen nie Key-Material in das Log.
- **Beleg:** `packages/mcp/src/audit-log.ts`, `packages/mcp/src/policy-gate.ts`, Tests `packages/mcp/src/audit-log.test.ts`

### A13 — Konfiguration & Feature-Gating

- **Rolle:** Betreiber-Konfiguration (der Owner selbst)
- **Fähigkeit:** Verhalten per Env steuern: `PECUNITY_READ_ONLY`, `PECUNITY_RPC_URL`, `PECUNITY_FACTORY_ADDRESS`, `PECUNITY_ADDRESS_ALLOWLIST`, `PECUNITY_ENABLED_SENSITIVE_STEPS`, `PECUNITY_MAX_AMOUNT_PER_TOKEN`, `PECUNITY_AUDIT_LOG_PATH`, `PECUNITY_CHAIN_ID` (Default 56), `PECUNITY_PCS_FACTORY_ADDRESS` (Default BSC-Mainnet), `PECUNITY_KEYCHAIN_ACCOUNT`.
- **Zweck:** Abgestufte Freischaltung: rein lesend → Writes → sensible Capabilities, jeweils explizit.
- **Fachliche Kriterien:**
  - *Normalfall:* Ohne `PECUNITY_RPC_URL` sind alle On-Chain-Write-Tools gar nicht erst registriert; `create_vault` braucht zusätzlich `PECUNITY_FACTORY_ADDRESS` (sonst stderr-Hinweis). `~` in Pfaden wird expandiert.
  - *Randfall:* Beim Start wird schreib-relevante Config gegen den Katalog validiert — nur Warnungen auf stderr, kein Abbruch: sensibler Step-Name ohne Katalog-Treffer (bliebe still gesperrt), Allowlist-Eintrag ohne gültiges EVM-Adressformat (matcht nie). Katalog nicht ladbar → Validierung entfällt still.
  - *Fehlerfall:* Fehlende Pflicht-Variablen → Startabbruch mit klarer Meldung (siehe A2).
- **Beleg:** `packages/mcp/src/config.ts`, `packages/mcp/src/config-validation.ts`, `packages/mcp/src/index.ts`, Tests `packages/mcp/src/config-validation.test.ts`

## Out of Scope

(Aus dem Code als bewusst nicht vorhanden ablesbar.)

- **Multi-Wallet/Multi-User:** genau eine Owner-Session pro Serverprozess; kein Wallet-Wechsel zur Laufzeit.
- **Result-Simulation für Automation-Deploys** (nur deposit/withdraw haben einen Dry-Run; echtes Feuern zeigt nur ein Fork).
- **First-Class-Import roher Private Keys** im Onboarding (bewusst nur verschlüsselte Keystores; Roh-Key bleibt Dev-Beispiel).
- **Bearbeiten/Aktualisieren eines Drafts** zwischen propose und deploy (bewusst kein Update-Pfad).
- **Voller Intent-Cross-Check für verzweigte Graphen** (nur Warnung/Markierung, flacher Intent deckt lineare Ketten ab).
- **Diebstahl-Schutz durch den Intent-Check selbst** — der Intent kommt vom selben LLM; Schutz gegen Abfluss leisten Allowlist + Confirm-Gate (explizit so dokumentiert in `intent-check.ts`).
- **Remote-/HTTP-Transport:** nur stdio, Bestätigungsseite nur loopback.
- **Verwaltung fremder Vaults oder öffentliche Ausführung fremder Automations.**

## Annahmen & offene Fragen

- **Annahme:** Der Rechner des Nutzers ist vertrauenswürdig (OS-Keychain, lokale Audit-Datei, loopback-Bestätigungsseite setzen das voraus). Ein kompromittierter lokaler Account ist außerhalb des Bedrohungsmodells.
- **Annahme:** Das Backend ist die Autorität für Owner-Isolation (403), Katalog, akzeptierte Tokens und Encode-Validierung; der MCP-Server dupliziert diese Checks nur dort, wo es vor einer Signatur nötig ist.
- **Annahme:** `session.auth.refresh()` genügt für die Session-Lebensdauer; ein vollständiger Re-Login bei abgelaufenem Refresh-Token ist im Code nicht vorgesehen (Server-Neustart nötig?). — **Offene Frage.**
- **Offene Frage:** Der In-Memory-Draft-Store verliert Drafts bei Serverneustart und die Backend-Draft-Automation (`MCP-Entwurf`) bleibt bei TTL-Ablauf ohne Deploy bestehen (Cleanup läuft nur bei Fehlern im propose-Pfad best-effort) — ist verwaister Backend-State akzeptiert?
- **Offene Frage:** Lifecycle-Writes (`top_up_gas_deposit`, `set_min_fee_deposit`) sind confirm-frei als „risikoärmer" eingestuft, bewegen aber Vault-Guthaben in die Gas-Reserve — ist diese Risikoeinstufung eine bewusste Produktentscheidung oder pragmatische Reibungs-Reduktion? (Code-Kommentar deutet auf bewusst: „bewegen kein Vermögen an externe Ziele".)
- **Offene Frage:** Der 60-s-Cache der Token-Decimals nimmt an, dass die kuratierte Token-Liste stabil ist; das Entfernen eines Tokens aus der Kuratierung wirkt bis zu 60 s verzögert.
- **Hinweis (Memory/Betrieb):** Die `paramSchema`-Beschreibungen aus dem Seed sind LLM-sichtbare Wahrheit — veralteter Text kann den Assistenten gültige Contract-Modi ablehnen lassen (bekanntes Drift-Risiko, siehe Projekt-Memory „MCP StepType schema drift").
