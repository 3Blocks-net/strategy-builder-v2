## Context

Pecunity hat heute einen Web-UI-Graph-Editor, einen JSON-Schema-Deskriptor (`paramSchema`) und eine validierende Encode-Boundary (`mapGraphToRaw` + `validateParams(mode:'raw')` + Raw-Mode-Guards) im Frontend. Backend-Endpunkte (`/auth/*` SIWE, `/vaults` owner-guarded, `/encode`/`/encode-update`, `/tokens/*`, `/executions`, `/step-types`) und ein `ContractErrorService.decodeRevert` existieren. Self-Custody ist der USP: Nutzer signieren heute jede TX selbst in der Wallet.

Dieser Change führt einen lokalen MCP-Server ein, der **im Namen des Nutzers signiert**. Dadurch wird Story 7 (Schutzmechanismen) zum Pflicht-Querschnitt, nicht zum Anhang: Ein Agent mit Signing-Vollmacht ist ein Angriffsziel (Prompt-Injection → Vermögens-Exfiltration). Dieser Change ist die Source of Truth (zuvor: ein separates PRD + Slice-Issues, in OpenSpec überführt); die 11 Slices liegen in `tasks.md`.

## Goals / Non-Goals

**Goals:**
- Strategien rein sprachlich aufsetzen und betreiben, ohne den Self-Custody-USP zu untergraben.
- Bestehende Encode-Boundary und Backend-Endpunkte wiederverwenden — **keine** Zweitimplementierung der Validierung.
- „Was du liest, ist was signiert wird": Confirm-Summary und Intent-Diff aus der **kanonischen TX**, nie aus der LLM-Erzählung.
- Schutz gegen **Diebstahl** server-erzwingen (nicht per Prompt umgehbar).

**Non-Goals (Out of Scope):**
- Hosted/remote MCP-Deployment (zentrale Signing-Instanz); externer Signer (Frame o. Ä.).
- Schutz gegen **Selbstschädigung** des Users (Liquidation, schlechte Trades).
- Per-Zeitfenster-Limits; struktureller Shape-Allowlist-/Preconditions-Layer; Multi-Wallet/Team.
- Strategie-Marktplatz über MCP; Community-/Third-Party-Tools; KI-Konsum externer MCP-Server.
- Fork-basierte Laufzeit-Simulation; Result-Simulation für `deploy_automation`; Withdraw an Nicht-Allowlist-Adressen; voll cross-checkbare verzweigte Graphen.

## Decisions

### Deployment-Modell: lokal (stdio)
Neues Paket `packages/mcp`, in Claude Desktop per command/stdio registriert. Der Schlüssel verlässt nie den Rechner; kein zentraler Honeypot. **Alternative verworfen:** Hosted/remote — zentrale Signing-Instanz widerspricht Self-Custody und erzeugt ein Honeypot-Risiko.

### Sprache/SDK: TypeScript + offizielles MCP SDK + viem
Konsistent mit dem TS-Monorepo (pnpm workspaces). On-chain-Reads/Sim über viem.

### Wallet-Zugang: Keystore + OS-Keychain (nicht Env)
Standard ist ein verschlüsselter JSON-Keystore; Passwort aus dem OS-Keychain, geschrieben über einen einmaligen interaktiven Init-CLI-Command. **Warum nicht Env/Prompt:** Unter stdio gibt es beim headless-Start kein TTY; ein Env-Passwort läge im Klartext in `claude_desktop_config.json` und höhlte die Keystore-Verschlüsselung aus. **Konsequenz:** native Keychain-Dependency (z. B. `keytar`) mit plattformabhängigem Build (bewusst akzeptiert). Roher Private Key nur als gekennzeichnetes Quick-Start-Beispiel.

### Auth: SIWE server-seitig, keine Backend-Änderung
`AuthClient` signiert die `SiweMessage` mit dem **Frontend-Host als `domain`** (derselbe Wert, den das Backend gegen `FRONTEND_URL` prüft). **Domain-Allowlist gestrichen:** Beim server-seitigen Signieren ohne Browser hat das Domain-Feld keine zusätzliche Schutzwirkung (die Signatur beweist Key-Besitz). `AuthService.verify`/`SignatureService.verify` bleiben unangetastet.

### Encode-Boundary als einzige Quelle (deep module)
`mapGraphToRaw`/`buildContextOverrides`/`mapParamsToRaw` ziehen nach `packages/shared` (hängen bereits nur von `shared`-Helfern ab → reine Extraktion). Frontend refactored auf die `shared`-Version; MCP konsumiert denselben Mapper und ruft die bestehenden `/encode`/`/encode-update`-Endpunkte (defensiv raw-mode-validierend). **Alternative verworfen:** Zweitimplementierung im MCP — Drift-Risiko, doppelte Wartung.

### AI-Building: freie Assemblierung + strukturierter Intent-Cross-Check
Der Agent assembliert **frei** aus `/step-types` (Power-User soll neue Strategien bauen). Backstop ist nicht das menschliche Lesen allein: Der Agent deklariert einen **flachen Intent** (`execution` + `trigger {typ,periode}` + geordnete Action-Liste `{action,token,richtung,betrag}`); der Server decodiert den **tatsächlichen** raw graph (via `SummaryDecoder`) und **lehnt bei Abweichung ab**. Deckt lineare Ketten (~90 %). **Verzweigte Graphen** entziehen sich dem flachen Diff → werden markiert und im Confirm besonders hervorgehoben. `execution` wird gegen die abgeleitete Topologie (`inferOwnerOnly`) geprüft, statt still abzuleiten.

### Recipes: Few-Shot-Shapes, nicht Templates
Seedbare Recipe-Tabelle (DCA, Stop-Loss, HF-Schutz) als **Shape mit Platzhaltern** (stabile Step-Type-IDs, keine Adressen, Werte als Platzhalter) → robust gegen Redeploy-Adress-Drift. Seed validiert jedes Recipe gegen den aktuellen Katalog. Nur team-kuratiert.

### Entwurf-zuerst: server-gehaltener Draft-Handle
`propose_automation` validiert und legt den Graphen **server-intern** ab (in-memory, pro Session, TTL — kein Backend-State), gibt eine Draft-ID. `deploy_automation` nimmt **nur die ID** und signiert exakt den gespeicherten Graphen; das Confirm zeigt dessen Decode. So kann das LLM zwischen propose und deploy nichts verändern.

### PolicyGate: zentraler Signing-Chokepoint (deep module)
Reine Entscheidungslogik (Confirm nötig? Limit? Allowlist? Capability? Read-only?) + IO-Adapter. Confirm primär per **MCP-Elicitation**, sonst **localhost-Seite** (Summary direkt vom Server-Prozess). Freigabe = **server-interner Zustand** (einmaliges Approval-Token, nur per Klick einlösbar, vom LLM nicht fälschbar). Das write-Tool **blockiert synchron**; **Timeout = hartes Fail**. Sensibilität ist **backend-seitig pro Step** markiert → nur sensible Steps lösen das Gate aus (vermeidet Confirmation-Fatigue).

### SummaryDecoder: schema-getrieben, neuer Baustein
Rekonstruiert aus der kanonischen TX/raw graph eine strukturierte Summary; Semantik (Token/Betrag/Empfänger/Richtung) aus den `x-ui-widget`/Rollen-Annotationen — kein per-step-type-Code. Gemeinsame Quelle für Confirm-Summary **und** Intent-Diff. Nicht identisch mit `ContractErrorService` (der deckt nur Reverts ab).

### Token-Allowlist vs. Adress-Allowlist (strikt getrennt)
**Token-Allowlist** greift am Encode-Zeitpunkt: der `shared`-Mapper wirft hart, wenn Token-Decimals unbekannt sind; der MCP löst Decimals aus `/tokens/*` → nicht-kuratierter Token bricht den Build ab. **Zieladress-Allowlist** greift über das schema-annotierte Empfänger-Feld (Withdraw-Empfänger + `ERC20Transfer.recipient`). Nicht verwechseln.

### Fehlerdekodierung
Reverts/Fehlschläge über den bestehenden `ContractErrorService.decodeRevert`-Pfad bzw. Indexer-/Execution-Endpunkte (`Step N: <reason>`, Aave-Codes, PancakeSwap-Require-Msgs) — kein roher Revert, kein stiller Teilerfolg.

## Risks / Trade-offs

- **Prompt-Injection bewegt Vermögen** → Confirm-Gate server-erzwungen (nicht per Prompt umgehbar), Adress-Allowlist für Geld-Ziele, Capability-Opt-in, Max-Betrag, Read-only. Pflicht-Testfall im Security-Review.
- **Key-Leak** → Key/Passwort nie in Logs/Fehlern/Tool-Ausgaben; Test mit erzwungenem Fehlerpfad; Keychain statt Env.
- **Intent ≠ Graph (LLM-Selbst-Inkonsistenz)** → Cross-Check Intent vs. decodierter Graph; bei Abweichung Reject mit Diff. Kein Diebstahl-Schutz (Intent kommt vom selben LLM) — Diebstahl ist über Allowlist/Confirm separat gelöst.
- **Verzweigte Graphen nicht voll cross-checkbar** → markiert + im Confirm hervorgehoben (kein voller Diff im MVP).
- **Native Keychain-Dependency (`keytar`)** → plattformabhängiger Build im pnpm-Workspace, bewusst akzeptiert.
- **Mapper-Extraktion bricht Web-UI** → reine Extraktion (nur `shared`-Abhängigkeiten); umgezogene Tests + unveränderte `frontend:build`/`frontend:test` als Gate.
- **`SummaryDecoder`/Allowlist-Guard ohne Rollen-Annotation blind** → Mindest-Annotations-Pass ist MVP-Pflicht; ein Step ohne Empfänger-Annotation muss als Test fehlschlagen.

## Migration Plan

- **Abhängigkeitsreihenfolge:** Slice 01 (Foundation) → {02, 03, 04, 05} → 06 (PolicyGate) & 07 (Decoder) → 08 (Build) → 09 (Deploy) → {10, 11}. Story 7 wird gemeinsam mit Slice 06 designt und vor/parallel zu 08–11 umgesetzt.
- **Tracer-Bullet:** Slice 01 (Auth) + ein Read-Tool → Confirm-Gate-Skelett + `create_vault` → AI-Building → Geldbewegung.
- **Review-Kadenz:** Security-Review-Gate vor Auslieferung jeder schreibenden Story (06, 09, 10, 11) und der Schutzmechanismen, inkl. Key-Handling-Review (01) und Prompt-Injection-Szenario.
- **Backend-Migrationen:** Recipe-Prisma-Entity + Migration + Seed; Rollen-Annotationen im StepType-Seed. Keine Änderung an `/auth/*` oder Encode-Endpunkten.
- **Rollback:** Das MCP-Paket ist additiv (lokal, opt-in). Die Mapper-Extraktion ist der einzige Frontend-berührende Schritt — bei Problemen Revert auf die lokale Kopie, da reine Extraktion ohne Verhaltensänderung.

## Open Questions

- Konkretes Wording des Erst-Verbindungs-Sicherheitshinweises.
- Genaue Felder/Tiefe der Read-Tool-Ausgaben und des flachen Intent-Schemas.
- Default-Schwelle des Max-Betrag-Limits.
- Format/Pfad und Tamper-Schutz (Hash-Kette?) der lokalen Audit-Log-Datei.
- TTL/Größe des in-memory Draft-Stores.
- Ob Slice 10/11 (Geldbewegung vs. Lifecycle/Gas-Deposit) wie vorgeschlagen getrennt bleiben.
