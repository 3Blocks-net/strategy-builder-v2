# PRD — Pecunity MCP-Server (DeFi-Vaults per KI-Assistent steuern)

> Quelle: `docs/epics/mcp-integration.md` + `docs/user-stories/mcp-integration.md`
> (7 Stories) + `docs/research-n8n-comparison.md`. Dieses PRD konkretisiert das Epic
> in eine umsetzbare Spezifikation. Alle im Interview getroffenen Entscheidungen sind
> in **Implementation Decisions** verankert; wo eine Entscheidung von der Epic-
> Empfehlung abweicht, ist das ausdrücklich markiert.

## Problem Statement

On-Chain-Strategien zu erstellen und zu betreiben erfordert heute, die Web-UI mit
ihrem Graph-Editor zu bedienen, die Bausteine (Conditions/Actions) und ihre Parameter
zu verstehen und jede Transaktion manuell in der Wallet zu signieren. Das ist für
Einsteiger eine hohe Einstiegshürde und für erfahrene Nutzer ein wiederkehrender
Medienbruch (App wechseln, Editor bedienen, einzeln bestätigen). Es gibt **keinen Weg,
eine Strategie in Worten zu beschreiben** und sie sicher umsetzen zu lassen — obwohl
unser Deskriptor (`paramSchema`, bereits JSON-Schema) und unsere validierende
Encode-Boundary (`mapGraphToRaw` + `validateParams(mode:'raw')` + Raw-Mode-Guards) die
idealen Bausteine dafür bereits liefern.

Betroffen sind gleichgewichtig zwei Personas:

- **Power-User / Vault-Betreiber** — kennen den Editor, suchen Geschwindigkeit und
  Komfort, wollen ihre Vaults im Chat-Kontext überblicken und steuern, ohne die App
  zu wechseln.
- **Neue, nicht-technische Nutzer** — wollen oder können den Graph-Editor nicht
  bedienen und möchten Strategien rein sprachlich aufsetzen. Für sie ist das
  Schutzbedürfnis am höchsten, da sie die On-Chain-Mechanik weniger durchschauen.

Der entscheidende Konflikt: Der **Self-Custody-USP** des Protokolls darf durch eine
KI-Steuerung nicht untergraben werden. Ein KI-Agent mit Signing-Vollmacht kann durch
Fehlinterpretation oder **Prompt-Injection** echtes Vermögen bewegen — Schutzmechanismen
sind deshalb Pflicht-Bestandteil, kein Anhang.

## Solution

Ein **Pecunity MCP-Server** als neues, lokal laufendes Workspace-Paket (`packages/mcp`,
stdio-Transport), das ein Nutzer in seiner Claude Desktop App registriert. Der Server
liest einen **verschlüsselten Keystore** (Passwort über den OS-Keychain), leitet daraus die
Owner-Adresse ab und authentifiziert sich per **server-seitig signierter SIWE-Nachricht**
gegen das bestehende Pecunity-Backend. Ab dann operiert der Agent **ausschließlich** auf
den Vaults genau dieser Wallet.

Aus Sicht der Personas:

- Der Nutzer **fragt** den Assistenten nach Vaults, Portfolio, Automations und
  Ausführungsverlauf (inkl. dekodierter Fehlschläge) — bestätigungsfrei, weil rein
  lesend und streng owner-isoliert.
- Der Nutzer **beschreibt eine Strategie in natürlicher Sprache** („kaufe wöchentlich
  für 50 USDT WBNB", „wenn mein Aave-Health-Factor unter 1,5 fällt, zahle Schulden
  zurück"). Der Agent assembliert daraus **frei aus dem Katalog** (`/step-types`) einen
  Graphen — angeleitet durch **kuratierte Beispiel-Shapes (Recipes)** als Few-Shot-
  Referenz. Der Graph läuft durch dieselbe **Encode-Boundary** wie die Web-UI; Ungültiges
  wird abgelehnt, **bevor** etwas on-chain geht.
- Der Nutzer **bewegt Geld und verwaltet den Lebenszyklus** (Vault erstellen,
  deposit/withdraw, Gas-Deposit auffüllen, Automation aktivieren/deaktivieren) per Chat —
  der Server signiert.
- **Sensible** schreibende/geldbewegende Aktionen durchlaufen ein **server-erzwungenes
  Confirm-Gate** (Sensibilität ist backend-seitig pro Step markiert; z. B. Withdraw und
  `ERC20Transfer` sind sensibel, Aave-Supply/Borrow nicht). Die menschenlesbare Klartext-
  Zusammenfassung wird **aus der kanonischen, gleich zu signierenden Transaktion / dem raw
  graph server-seitig dekodiert** (nie aus der LLM-Erzählung), zuerst per **MCP-
  Elicitation** vorgelegt; unterstützt der Client das nicht, öffnet sich eine **lokale
  Bestätigungsseite (localhost)**. Das write-Tool **blockiert synchron** auf eine server-
  interne Freigabe (vom LLM nicht fälschbar); **Timeout = hartes Fail, kein Signieren**.
  Zusätzlich greifen **server-erzwungene Schutzschichten**: eine **Adress-Allowlist** für
  Geld-Ziele (Withdraw-Empfänger **und** `ERC20Transfer.recipient`), **Capability-Opt-in**
  für sensible Steps (per Default verboten, nur out-of-band per Config freischaltbar), ein
  **Max-Betrag pro Aktion**, ein **Read-only-Modus**, eine **Simulation/Dry-Run** (nur für
  direkte Geldbewegungen) und ein **lokales Audit-Log**.

Der strategische Hebel ist „n8n für die Blockchain": n8n exponiert Workflows als
AI-Tools, wir exponieren On-Chain-Bausteine — mit dem strukturellen Vorsprung, dass unser
`paramSchema` bereits MCP-natives JSON-Schema ist und die Encode-Boundary fehlerhaften
KI-Output abfängt.

## User Stories

### Verbinden & Authentifizieren (Fundament — Story 1)

1. Als selbstverwaltender DeFi-Nutzer möchte ich den Pecunity MCP-Server über eine
   dokumentierte Konfiguration in Claude Desktop registrieren, damit der Assistent
   meine Vaults steuern kann.
2. Als Nutzer möchte ich meinen Wallet-Zugang über einen **verschlüsselten Keystore**
   hinterlegen, dessen Passwort im **OS-Keychain** (macOS Keychain / Windows Credential
   Manager / Linux libsecret) liegt und über einen einmaligen **Init/Onboarding-CLI-
   Command** (interaktives Terminal) hinterlegt wird — damit weder Schlüssel noch Passwort
   im Klartext auf der Platte (insb. nicht in `claude_desktop_config.json`) liegen.
3. Als Nutzer möchte ich, dass der rohe Private Key **nur als ausdrücklich
   gekennzeichnetes Quick-Start-Beispiel** dokumentiert ist, nicht als Standard, damit
   ich nicht versehentlich die unsichere Variante wähle.
4. Als Nutzer möchte ich, dass mein Wallet-Zugang **niemals im Klartext geloggt** wird
   und **nicht** in Tool-Ausgaben an das LLM erscheint, damit kein Key-Leak möglich ist.
5. Als Nutzer möchte ich, dass der Server aus meinem Zugang die **Owner-Adresse** ableitet
   und sich per **server-seitig signierter SIWE-Nachricht** beim Backend authentifiziert
   (analog zum bestehenden `/auth/nonce` → `/auth/verify`-Flow).
6. Als Nutzer möchte ich den Agenten fragen können „**mit welcher Adresse bin ich
   verbunden?**" und die korrekte Adresse erhalten, damit ich meine Identität verifizieren
   kann.
7. Als Nutzer möchte ich, dass **alle** folgenden Tools ausschließlich im Kontext genau
   dieser Owner-Adresse operieren und ein Zugriff auf fremde Vaults unmöglich ist.
8. Als Nutzer möchte ich bei fehlendem/ungültigem Wallet-Zugang eine **klare, sichere
   Fehlermeldung** (kein Stacktrace, keine Key-Fragmente) erhalten.
9. Als Nutzer möchte ich beim ersten Verbinden einen **deutlichen Sicherheitshinweis**
   sehen (der Server kann in meinem Namen signieren — was das bedeutet, wie ich den
   Zugang entziehe).
10. Als Nutzer möchte ich die Verbindung über einen **dokumentierten Weg wieder
    trennen / den Zugang entfernen** können.

### Lesen & Discovery (Story 2)

11. Als verbundener Nutzer möchte ich **alle Vaults meiner Adresse auflisten** (Adresse,
    Label, Deposit-Token), damit ich einen Überblick bekomme.
12. Als Nutzer möchte ich pro Vault **Portfolio/Bestände** und den **Gas-Deposit-Stand**
    abrufen, damit ich den Zustand meiner Strategien verstehe.
13. Als Nutzer möchte ich die **Automations eines Vaults** auflisten (aktiv/pausiert,
    owner-only/public, Kurzbeschreibung der Schritte).
14. Als Nutzer möchte ich den **Ausführungsverlauf** abrufen (erfolgreiche Runs,
    Deposits/Withdraws und **dekodierte Fehlschläge** wie `Step N: <reason>`).
15. Als Nutzer möchte ich, dass alle Lese-Tools **strukturierte, fürs LLM gut
    interpretierbare** Ergebnisse liefern (nicht nur Roh-Hex).
16. Als Nutzer möchte ich, dass sämtliche Abfragen **streng auf meine eigenen Vaults**
    begrenzt sind.
17. Als Nutzer möchte ich bei einem Vault **ohne Daten** eine klare Leer-Antwort statt
    eines Fehlers erhalten.
18. Als Nutzer möchte ich, dass Lese-Tools **bestätigungsfrei** sind (keine Reibung ohne
    Risiko).

### Katalog (Enabler — Story 3)

19. Als Nutzer (mittelbar über den Agenten) möchte ich, dass der Agent **alle StepTypes
    auflisten** kann (Conditions + Actions, Name, Kategorie, Kurzbeschreibung).
20. Als Nutzer möchte ich, dass der Agent zu einem StepType die **Detailbeschreibung**
    abrufen kann: `paramSchema` (Felder, Typen, Defaults), Bedeutung jedes Parameters und —
    sofern angereichert — Subkategorie/Protokoll, „wann benutzen", Beispiele und
    Risikohinweis.
21. Als Nutzer möchte ich, dass die Beschreibung klar macht, welche **Kontext-Slots** ein
    Schritt liest/schreibt, soweit das Schema das hergibt.
22. Als Nutzer möchte ich, dass der Katalog **nur tatsächlich deployte** StepTypes
    widerspiegelt (keine Null-Adress-Bausteine).
23. Als Nutzer möchte ich, dass die Ausgabe **JSON-Schema-treu** ist, damit der Agent sie
    nativ konsumiert.
24. Als Nutzer möchte ich, dass der Agent **kuratierte Beispiel-Shapes (Recipes)** als
    Referenz abrufen kann (DCA, Stop-Loss, HF-Schutz), damit er gute Graph-Formen lernt,
    bevor er frei assembliert.

### Vault erstellen (Story 4)

25. Als neuer/expandierender Nutzer möchte ich den Agenten anweisen, in meinem Namen
    einen **Vault zu erstellen** (Label, Deposit-Token); der Server signiert + sendet die TX.
26. Als Nutzer möchte ich, dass die Parameter **vor dem Senden bestätigend zusammengefasst**
    werden (Confirm-Gate aus Story 7).
27. Als Nutzer möchte ich, dass der **Deposit-Token validiert** wird (von FeeRegistry
    akzeptiert) — sonst klare Fehlermeldung, **bevor** eine TX gesendet wird.
28. Als Nutzer möchte ich nach Erfolg die **neue Vault-Adresse** und den TX-Hash
    (BscScan-fähig) zurückerhalten.
29. Als Nutzer möchte ich, dass der neue Vault anschließend sowohl in der MCP-Liste
    (Story 2) **als auch** in der Web-UI erscheint.
30. Als Nutzer möchte ich bei fehlgeschlagener TX eine **dekodierte, verständliche**
    Fehlermeldung statt eines rohen Reverts.

### Automation aus Sprache bauen & deployen (Kern-MVP — Story 5)

31. Als Strategie-Nutzer möchte ich eine Strategie **in natürlicher Sprache** beschreiben
    und der Agent baut daraus einen **Automation-Graphen**, der **frei aus den
    Katalog-Bausteinen** assembliert wird (angeleitet durch die Recipe-Referenz-Shapes).
32. Als Nutzer möchte ich, dass der erzeugte Graph die bestehende **Encode-Boundary**
    (`mapGraphToRaw` + `validateParams(mode:'raw')` + Raw-Mode-Guards) durchläuft;
    **ungültige Graphen werden abgelehnt** (kein Deploy), mit Erklärung, was fehlt/falsch ist.
33. Als Nutzer möchte ich, dass der Agent die fertige Automation **menschenlesbar
    zusammenfasst** (welche Schritte, Beträge/Token, welcher Trigger) **vor** dem Deploy.
34. Als Nutzer möchte ich, dass der Deploy erst nach **expliziter Bestätigung** erfolgt
    (Confirm-Gate); der Server signiert die nötigen TX (Kontext-Setup + create/update).
35. Als Nutzer möchte ich nach Erfolg die **On-Chain-Automation-ID** und TX-Hash(es)
    zurückerhalten; die Automation erscheint in Story 2 und der Web-UI.
36. Als Nutzer möchte ich auf Wunsch **zuerst nur einen Entwurf** vorgeschlagen bekommen,
    ohne zu deployen.
37. Als Nutzer möchte ich, dass eine fehlende Voraussetzung (z. B. nicht existierender
    PancakeSwap-Pool/Tier) **vor dem Deploy** erkannt und erklärt wird (Pool-/Token-
    Validity-Check).
38. Als Nutzer möchte ich, dass **keine erfundenen Adressen/Selektoren** verwendet
    werden — nur seed-/katalog-gestützte StepTypes.

### Geld bewegen & Lifecycle (Story 6)

39. Als aktiver Vault-Betreiber möchte ich **Deposit** (Token + Betrag) und **Withdraw**
    (Token + Betrag + Empfänger) ausführen lassen; Beträge werden korrekt in Base-Units
    konvertiert (Token-Decimals).
40. Als Nutzer möchte ich den **Gas-Deposit** auffüllen (`depositFees`) und
    `minFeeDeposit` setzen können.
41. Als Nutzer möchte ich eine Automation **aktivieren/deaktivieren** (`setAutomationActive`).
42. Als Nutzer möchte ich, dass **jede sensibel markierte geldbewegende Aktion** eine
    explizite Bestätigung mit aus der kanonischen TX dekodierter Klartext-Zusammenfassung
    (Betrag, Token, Empfänger) erfordert.
43. Als Nutzer möchte ich, dass ein Withdraw (und ein `ERC20Transfer`) **nur an Adressen
    aus meiner Adress-Allowlist** (Owner + bewusst eingetragene Ziele) gehen kann;
    Nicht-Allowlist-Ziele werden **abgelehnt**, nicht nur hervorgehoben.
44. Als Nutzer möchte ich, dass anfallende **Fees** (Deposit/Withdraw-BPS) **vor** der
    Bestätigung transparent gemacht werden.
45. Als Nutzer möchte ich bei fehlgeschlagener TX eine **dekodierte** Fehlermeldung; kein
    stiller Teilerfolg.
46. Als Nutzer möchte ich, dass sich Aktivieren/Deaktivieren in Story 2 und der Web-UI
    widerspiegelt.

### Schutzmechanismen (Pflicht-Querschnitt — Story 7)

47. Als Nutzer möchte ich, dass **jede sensibel markierte** schreibende/signierende Aktion
    **vor Ausführung** eine aus der kanonischen TX dekodierte Zusammenfassung erzeugt und
    eine **explizite Bestätigung** erfordert (nicht-sensible Aktionen laufen
    bestätigungsfrei).
48. Als Nutzer möchte ich, dass die Bestätigung **server-erzwungen** ist (nicht per Prompt
    umgehbar): primär per **MCP-Elicitation**, andernfalls über eine **lokale
    Bestätigungsseite (localhost)**.
49. Als Nutzer möchte ich, dass write-Tools **hart fehlschlagen bzw. auf den localhost-
    Pfad ausweichen**, wenn keine Bestätigungsmöglichkeit besteht — niemals stilles
    Signieren.
50. Als Nutzer möchte ich einen **konfigurierbaren Max-Betrag pro Aktion** (pro Token),
    dessen Überschreitung die Aktion blockiert bzw. eine gesonderte Freigabe erfordert.
51. Als Nutzer möchte ich, dass jedes Geld-Ziel (Withdraw-Empfänger **und**
    `ERC20Transfer.recipient`) gegen eine **user-gepflegte Adress-Allowlist** geprüft wird;
    der Server identifiziert das Empfänger-Feld **schema-getrieben** über die Step-
    Annotation (`x-ui-role: recipient` / `account-selector`).
52. Als Nutzer möchte ich einen **Read-only-Modus** aktivieren können, der **alle**
    write/signing-Tools vollständig deaktiviert.
53. Als Nutzer möchte ich eine schreibende Aktion **simulieren/dry-run** lassen (erwartetes
    Ergebnis, geschätzte Fees/Gas) **ohne** sie zu senden.
54. Als Nutzer möchte ich ein **Audit-Log**, das pro Aktion Zeitpunkt, Tool, Parameter,
    TX-Hash und Ergebnis festhält und das ich abrufen kann.
55. Als Nutzer möchte ich, dass der Schutz **nicht durch reinen Prompt umgehbar** ist
    (Bestätigung/Limits serverseitig erzwungen).

## Implementation Decisions

### Getroffene Grundsatz-Entscheidungen (aus dem Epic bestätigt)

- **Custody:** Der MCP-Server signiert selbst → Story 7 (Schutzmechanismen) ist Pflicht.
- **Umfang:** voller Lebenszyklus inkl. Geldbewegung.
- **Zielgruppe:** Power-User und nicht-technische Nutzer gleichgewichtig.

### Architektur & Prozessmodell

- **Deployment-Modell: lokal (stdio).** Neues Workspace-Paket `packages/mcp`, das der
  Nutzer in Claude Desktop per command/stdio registriert. Der Schlüssel verlässt nie den
  Rechner des Nutzers; kein zentraler Honeypot. (Hosted/remote bleibt out of scope.)
- **Sprache/SDK:** TypeScript mit dem offiziellen MCP SDK; konsistent mit dem
  TS-Monorepo (pnpm workspaces). On-chain-Interaktion über **viem**.
- **Owner-Isolation:** Der Server hält genau eine authentifizierte Owner-Session; alle
  Tools sind auf deren Adresse gebunden. Backend-Aufrufe gehen über bestehende
  owner-geschützte Endpunkte (`VaultOwnerGuard`/`VaultAccessService`).

### Wiederverwendung der Encode-Boundary (deep module)

- **Extraktion in `packages/shared`:** `mapGraphToRaw`, `buildContextOverrides` und
  `mapParamsToRaw` werden aus dem Frontend (`features/automation-editor/lib/encode-boundary.ts`)
  nach `shared` verschoben. Sie hängen bereits nur von `shared`-Helpern ab (`toSeconds`,
  `encodeTimestamp`, `toBaseUnits`, `zeroToggleField`, `validateParams`).
- **Frontend wird auf die `shared`-Version refaktoriert** (importiert sie, eigene Kopie
  entfällt) — **eine einzige Quelle**, keine Duplikation/Drift.
- Der MCP-Server konsumiert denselben `shared`-Mapper, erzeugt den **raw graph** und ruft
  die **bestehenden** Backend-Endpunkte `POST :address/automations/:id/encode` /
  `/encode-update` auf, die defensiv `validateParams(mode:'raw')` + Raw-Mode-Guards laufen
  lassen. **Keine Zweitimplementierung der Validierung.**

### Authentifizierung (SIWE, server-seitig)

- **`AuthClient` (deep module):** `GET /auth/nonce` → baut eine `SiweMessage` → signiert
  mit dem Wallet-Key → `POST /auth/verify` → speichert Access-/Refresh-JWT → `POST
  /auth/refresh` bei Ablauf. Key/Tokens erscheinen nie in Logs oder Tool-Ausgaben.
- **Domain-Handling — keine Backend-Änderung.** Der MCP-Server signiert die SIWE-Message
  mit dem **Frontend-Host als `domain`** (derselbe Wert, den das Backend heute gegen
  `FRONTEND_URL` prüft). Die ursprünglich geplante Domain-Allowlist ist **gestrichen**:
  Beim server-seitigen Signieren ohne Browser hat das Domain-Feld keine zusätzliche
  Schutzwirkung (die Signatur beweist den Key-Besitz). `AuthService.verify` /
  `SignatureService.verify` bleiben **unangetastet**.

### Wallet-Zugang

- **`WalletSigner` (deep module):** Standard ist ein **verschlüsselter JSON-Keystore**,
  dessen Passwort aus dem **OS-Keychain** (macOS Keychain / Windows Credential Manager /
  Linux libsecret) gelesen wird — **nicht** aus Env/Prompt (unter stdio gibt es kein
  interaktives TTY beim headless-Start durch Claude Desktop; ein Env-Passwort läge im
  Klartext in `claude_desktop_config.json` und höhlte die Keystore-Verschlüsselung aus).
  Das Passwort wird über einen einmaligen **Init/Onboarding-CLI-Command** (echtes Terminal)
  in den Keychain geschrieben; zur Laufzeit liest der Server es headless.
  - **Konsequenz:** Story 1 bekommt einen expliziten Init/Onboarding-Command als Scope-
    Item; es entsteht eine **native Keychain-Dependency** (z. B. `keytar`) mit plattform-
    abhängigem Build im pnpm-Workspace (bewusst akzeptiert).
  - Roher Private Key nur als **gekennzeichnetes Quick-Start-Beispiel** in der Doku.
    Externer Signer ist out of scope (spätere Option). Der Signer kapselt Address-Ableitung
    und TX-Signatur; Key-Material wird nie nach außen gereicht.

### AI-Building (Story 5)

- **Modell: freie Assemblierung + strukturierter Intent-Cross-Check.** Der Agent
  assembliert **frei** aus den `/step-types`-Bausteinen (der Power-User soll auch neue
  Strategien bauen können). Der Korrektheits-Backstop ist **nicht** das menschliche Lesen
  allein, sondern ein **Intent-Cross-Check**: Der Agent deklariert zusätzlich einen
  **strukturierten Intent**; der Server **dekodiert den tatsächlichen raw graph** (siehe
  Decoder unten) und **lehnt bei Abweichung Intent ≠ Graph ab** (z. B. Intent „wöchentlich",
  Graph „täglich"). Das fängt LLM-Selbst-Inkonsistenz/Unfälle (kein Diebstahl-Schutz — der
  Intent kommt vom selben LLM; Diebstahl ist über Allowlists/Confirm separat gelöst).
  - **Flacher Intent für MVP:** `execution: public|owner` + `trigger {typ, periode}` +
    **geordnete Action-Liste** `{action, token, richtung, betrag}`. Deckt lineare Ketten
    (`condition → action → … → DONE`, ~90 % der realen Strategien). **Verzweigte Graphen**
    (mittige Conditions, true/false-Branches) entziehen sich dem flachen Diff → werden
    **als „nicht voll cross-checkbar" markiert** und im Confirm-Gate **besonders
    hervorgehoben**.
  - **`execution`-Guard:** `ownerOnly` wird heute aus der Topologie *abgeleitet*
    (`inferOwnerOnly`). Der Server prüft den deklarierten `execution`-Intent **gegen** die
    abgeleitete Topologie und **lehnt bei Widerspruch ab** — statt still abzuleiten (sonst
    Fehlerklasse „deployt, läuft aber nie", die durch jedes Gate rutscht).
- **Recipes als Few-Shot-Referenz-Shapes:** Eine **seedbare Recipe-Tabelle im Backend**
  (DCA, Stop-Loss, HF-Schutz) liefert Beispiel-Graph-**Formen** als Anleitung — **keine**
  harten Templates. Format: **Shape mit Platzhaltern** (stabile **Step-Type-IDs**, **keine**
  konkreten Contract-/Token-Adressen, Werte als Platzhalter wie `TOKEN_IN`/`BETRAG`/
  `INTERVALL`) — robust gegen Redeploy-Adress-Drift. Der Seed **validiert jedes Recipe gegen
  den aktuellen Katalog** (unbekannter Step-Type / Param-Drift → wird nicht ausgeliefert).
  Recipes sind **nur team-kuratiert**, nie user-/community-schreibbar (MVP). Bereitgestellt
  über einen Lese-Endpunkt (analog/neben `/step-types`).
- **Guardrails = bestehende Boundary + Validity-Checks**, kein neuer struktureller
  Shape-Allowlist-/Preconditions-Layer im MVP:
  - Encode-Boundary (raw-mode) lehnt ungültige Parameter/Graphen ab.
  - **Pool-Existenz-Check** (Äquivalent zu `usePoolValidity`): der MCP liest
    `factory.getPool(tokenIn, tokenOut, fee)` direkt via viem gegen den RPC.
  - **Token-Allowlist greift am Encode-Zeitpunkt:** der `shared`-Mapper **wirft hart**, wenn
    er die Decimals eines Tokens nicht kennt; der MCP löst Decimals aus den `/tokens/*`-
    Listen auf → ein **nicht-kuratierter Token bricht den Build ab, bevor signiert wird**.
    Das **ist** die Token-Allowlist-Durchsetzung (kein zweiter, separater Check). Strikt
    getrennt davon ist die **Zieladress-Allowlist** (greift über das annotierte Empfänger-
    Feld) — beide nicht verwechseln.
- **Entwurf-zuerst (`propose_automation`) = server-gehaltener Draft-Handle.** `propose`
  validiert den Graphen und legt ihn **server-intern im MCP-Prozess** ab (in-memory, pro
  Session, mit TTL — **kein** Backend-State), gibt eine **Draft-ID** zurück. `deploy` nimmt
  **nur die ID** und signiert **exakt** den gespeicherten Graphen; das Confirm zeigt die
  (b)-Decode des **gespeicherten** Entwurfs. So kann das LLM zwischen propose und deploy
  **nichts** verändern („was du gesehen hast = was du bestätigst").

### Schutzmechanismen (Story 7)

- **Bedrohungsmodell (explizit):** Schutzziel ist **Diebstahl** (ein Angreifer profitiert,
  z. B. via Prompt-Injection). **Selbstschädigung** des Users (Liquidation, schlechte
  Trades) ist **out of scope**. „Sensibilität" eines Steps = „für einen Angreifer
  attraktiv", nicht „kann dem User schaden" — deshalb sind Withdraw/`ERC20Transfer`
  sensibel (Exfiltration), Aave-Borrow/Supply/Swap nicht (Wert bleibt im Vault bzw. ist
  durch die Token-Allowlist gebunden; MEV/Sandwich am 0-Slippage-Swap ist akzeptiertes
  Protokoll-Risiko).
- **`PolicyGate` (deep module):** zentraler Signing-Chokepoint. Reine Entscheidungs-Logik
  (Confirm nötig? Limit überschritten? Ziel-Allowlist? Capability freigeschaltet? Read-
  only?) + IO-Adapter für die Bestätigungs-Frontends.
- **Sensibilität ist backend-seitig pro Step markiert.** Nur ein **sensibel markierter Step
  in einer Automation** (oder eine sensible Direktaktion wie Withdraw) löst das Confirm-Gate
  aus; nicht-sensible Aktionen laufen bestätigungsfrei (vermeidet Confirmation-Fatigue, die
  sonst den einen gefährlichen Fall durchwinkt).
- **Confirm-Summary aus der kanonischen TX (verbindlich):** Die Zusammenfassung wird
  **server-seitig aus der gleich zu signierenden Transaktion / dem raw graph dekodiert**
  (nie aus den LLM-Tool-Argumenten) — nur so *ist* das Gelesene das Signierte. Pflichtfeld
  u. a. **`execution: public|owner`** (autonom feuernd vs. nur durch Owner).
- **Confirm-Gate:** primär **MCP-Elicitation**; fehlt Support, öffnet sich eine **lokale
  Bestätigungsseite (localhost)**, deren Summary **direkt vom Server-Prozess** kommt. Die
  Freigabe ist ein **server-interner Zustand** (z. B. ein einmaliges, pro-Aktion erzeugtes
  Approval-Token, nur per Klick einlösbar) — das LLM kann sie **nicht fälschen**. Das write-
  Tool **blockiert synchron**, bis Freigabe oder Timeout; **Timeout = hartes Fail, kein
  Signieren**. Beide Pfade schreiben Summary + Outcome ins Audit-Log.
- **Schutzschichten (MVP, server-erzwungen):**
  - **Adress-Allowlist (Geld-Ziele):** Withdraw-Empfänger **und** `ERC20Transfer.recipient`
    dürfen **nur** Allowlist-Adressen sein (Owner + bewusst eingetragene Ziele); sonst
    **Ablehnung**. Der Server identifiziert das Empfänger-Feld **schema-getrieben** über die
    Step-Annotation. Strikt getrennt von der Token-Allowlist (siehe AI-Building).
  - **Capability-Opt-in für sensible Steps:** sensible Steps sind per Default **verboten**
    und müssen **out-of-band per Config** (nicht LLM-schreibbar) explizit freigeschaltet
    werden, bevor der Agent sie verbauen darf.
  - **Max-Betrag pro Einzelaktion** (pro Token), aus der MCP-Config.
  - **Read-only-Modus:** Config-Flag, das alle write/signing-Tools deaktiviert.
  - *(Per-Zeitfenster-Limit ist out of scope für MVP.)*
- **`Simulator` (module):** Dry-Run via viem `simulateContract`/`estimateGas` gegen
  denselben RPC; liefert erwartetes Ergebnis + geschätzte Fees/Gas, ohne zu senden —
  **nur für direkte Geldbewegungen** (deposit/withdraw/create_vault). Für `deploy_automation`
  gibt es **bewusst keine** Result-Simulation (das echte Feuern zeigt nur ein Fork; out of
  scope); die (b)-decodierte Vorschau ist dort der Ersatz. Tool-Beschreibung sagt das ehrlich.
- **`AuditLog` (module):** append-only **lokale Datei** auf dem Rechner des Nutzers
  (Zeitpunkt, Tool, Parameter, TX-Hash, Ergebnis) — self-custody-konsistent. (Tamper-Schutz
  über reine Append-Konvention hinaus — z. B. Hash-Kette — ist offener Refinement-Punkt.)

### Calldata-/Graph-Decoder (neuer Baustein — trägt Confirm + Cross-Check)

- **`SummaryDecoder` (deep module, neu):** rekonstruiert aus der **kanonischen TX / dem raw
  graph** eine menschenlesbare, strukturierte Zusammenfassung (Funktion, Token, Betrag
  Base-Units→human, Empfänger, Richtung, Trigger, `execution`-Modus). Er ist die gemeinsame
  Quelle für **(1)** die Confirm-Summary und **(2)** den decodierten Graphen, gegen den der
  Intent gediffт wird.
- **Schema-getrieben:** Die pro Step nötige Semantik (welches Feld ist Token/Betrag/
  Empfänger/Richtung) wird aus den vorhandenen **`x-ui-widget`/Rollen-Annotationen** im
  `paramSchema` gelesen — kein per-step-type-Code (konsistent mit „kein per-step-type-Code").
- **Abhängigkeit:** setzt einen **Mindest-Annotations-Pass über den Katalog** voraus (siehe
  Out of Scope) — ohne Rollen-Annotation ist ein Feld für Decoder **und** Allowlist-Guard
  unsichtbar.
- Dies ist **nicht** `ContractErrorService` (der deckt nur Reverts ab) — ein eigenes Stück
  Arbeit.

### Fehlerdekodierung & Feedback

- Fehlgeschlagene TX und Reverts werden über den bestehenden
  `ContractErrorService.decodeRevert`-Pfad bzw. die Indexer-/Execution-Endpunkte
  **dekodiert** zurückgegeben (`Step N: <reason>`, Aave-Codes, PancakeSwap-Require-Msgs) —
  kein roher Revert, kein stiller Teilerfolg.

### Tool-Oberfläche (Richtwert, JSON-Schema-getrieben)

- **Auth/Identität:** `whoami`.
- **Read (bestätigungsfrei):** `list_vaults`, `get_vault`, `get_portfolio`,
  `list_automations`, `get_executions`, `list_step_types`, `describe_step_type`,
  `list_recipes`, `get_audit_log`.
- **Build (lesend bis Deploy):** `propose_automation` (Graph + Encode-Boundary-Validierung
  + Intent-Cross-Check, ohne Deploy; legt den Entwurf server-intern ab und gibt eine
  **Draft-ID** zurück), `simulate_action` (nur Geldbewegungen).
- **Write (Confirm-Gate bei Sensibilität + Schutzschichten):** `create_vault`,
  `deploy_automation` (nimmt eine **Draft-ID**), `deposit`, `withdraw`,
  `top_up_gas_deposit`, `set_min_fee_deposit`, `set_automation_active`.
- **Hinweis:** Confirm-Summary + Intent-Diff werden vom neuen **`SummaryDecoder`** erzeugt
  (siehe oben), nicht von den Tool-Argumenten.

### Backend-Änderungen (minimal, an bestehenden Pfaden)

1. **Recipe-Tabelle** (Prisma-Entity) + Seed als Shape-mit-Platzhaltern (DCA, Stop-Loss,
   HF-Schutz) + Lese-Endpunkt; Seed validiert Recipes gegen den aktuellen Katalog.
2. **Mindest-Annotations-Pass über den StepType-Seed** (Rollen-Marker pro Feld:
   Token/Betrag/Empfänger/Richtung) — Voraussetzung für `SummaryDecoder` **und** Adress-
   Allowlist-Guard. Konkret fehlt heute u. a. ein Rollen-Marker an
   `ERC20TransferAction.recipient` (`seed.ts`).
3. **Keine** SIWE-Domain-Allowlist (gestrichen — `AuthService.verify` bleibt unangetastet).
4. Keine neuen Encode-/Validierungs-/Simulate-Endpunkte — MCP nutzt bestehende
   `encode`/`encode-update`/`tokens`/`executions`-Pfade und viem-RPC-Reads.

## Testing Decisions

**Was einen guten Test ausmacht:** Tests prüfen **externes Verhalten** an der
Modul-Schnittstelle, nicht Implementierungsdetails — table-driven, deterministisch, ohne
LLM und ohne echte Chain, wo immer möglich. Vorbild ist die bestehende Test-Kultur:
`ActionLibHF.ts` (hard-fixture Unit-Tests über ein Harness), `shared`-Tests
(`validation.test.ts`, `amount.test.ts`, `duration.test.ts`, `timestamp.test.ts`) und die
Backend-Integrationstests mit gemocktem Prisma (`auth.integration.spec.ts`,
`encoding.service.spec.ts`).

**Isolierte Tests für diese drei deep modules (im Interview gewählt):**

1. **Shared Graph-Mapper (`friendly → raw`).** Reine Funktion in `shared`: friendly Graph
   + `contextOverrides` → raw Graph/Encode-Inputs. Table-driven, kein LLM, keine Chain.
   Höchste Korrektheits-Hebelwirkung; Prior Art: die bestehenden `shared`-Tests + die
   aktuellen Frontend-Tests des Mappers (werden auf die `shared`-Version umgezogen).
2. **SIWE-Signing-AuthClient.** Handshake gegen ein **gemocktes Backend**: nonce → SIWE
   bauen+signieren → verify → JWT speichern/refreshen; korrekte Domain; **kein Key-Leak**
   in Fehlern/Logs. Prior Art: `auth.integration.spec.ts`, `signature.service.spec.ts`.
3. **Owner-Isolation der Read-Tools.** Gegen gemockte Backend-Antworten: Read-Tools liefern
   **nur** Vaults des verbundenen Owners; Fremd-Vault-Zugriff unmöglich; Leerzustand vs.
   Fehler korrekt unterschieden.

**Zusätzlich durch die Story-7-DoD verpflichtend (Verhaltenstests des `PolicyGate`):**
serverseitige Erzwingung der Bestätigung (nicht per Prompt aushebelbar, Freigabe = server-
interner Zustand), **Timeout = hartes Fail**, Greifen des Max-Betrag-Limits, **Adress-
Allowlist** (Withdraw/`ERC20Transfer`-Ziel außerhalb der Allowlist → Ablehnung),
**Capability-Opt-in** (nicht freigeschalteter sensibler Step → nicht verbaubar), und der
Read-only-Modus deaktiviert alle Write-Tools. **Prompt-Injection-Szenario** ist Pflicht-
Testfall im Security-Review.

**`SummaryDecoder` + Intent-Cross-Check (verpflichtend):** table-driven, schema-getrieben —
ein manipulierter raw graph erzeugt eine **abweichende** Summary (Beweis, dass die Summary
aus der TX und nicht aus den Tool-Args stammt); Intent ≠ decodierter Graph → **Reject mit
Diff**; `execution`-Intent ≠ abgeleitete Topologie → Reject; verzweigter Graph wird als
„nicht voll cross-checkbar" markiert. Ein Step **ohne** Rollen-Annotation am Empfänger-Feld
muss als Test **fehlschlagen** (Allowlist-Guard darf nicht stillschweigend durchlassen).

**Fork-/E2E-Tests** (passend zur bestehenden Fork-Test-Praxis): mindestens ein
AI-gebautes Muster end-to-end bis zur feuernden Automation; Vault-Erstellung inkl.
Signatur; deposit/withdraw inkl. Decimals + Fee-Abzug; ungültiger Graph wird von der
Encode-Boundary abgelehnt (kein Deploy); kein Deploy ohne explizite Bestätigung.

## Out of Scope

- **Hosted/remote MCP-Deployment** (zentrale Signing-Instanz) — MVP ist rein lokal (stdio).
- **Externer Signer** (Frame o. Ä.) — spätere Option; MVP nutzt verschlüsselten Keystore.
- **Per-Zeitfenster-Limits** (rollierende Periode) — MVP nur Max-Betrag pro Aktion.
- **Struktureller Shape-Allowlist-/Preconditions-Layer** über die Encode-Boundary hinaus.
- **Multi-Wallet-/Team-Accounts.**
- **Strategie-Marktplatz-Anbindung über MCP** (eigenes Epic/PRD).
- **Community-/Third-Party-Tools/-Actions** (delegatecall-Sicherheitsrisiko).
- **KI-Konsum externer MCP-Server** (n8ns „MCP Client"-Richtung).
- **Fork-basierte Simulation zur Laufzeit** — MVP simuliert via viem `simulate`/`estimate`,
  und auch das **nur für direkte Geldbewegungen**; für `deploy_automation` gibt es keine
  Result-Simulation.
- **Withdraw/Transfer an freie (Nicht-Allowlist-)Adressen** — der MVP erlaubt Geld-Ziele
  **nur** aus der Adress-Allowlist; freie Ziele sind out of scope. (Vereinfachtes/geführtes
  Freischalten von Adressen ist ebenfalls out of scope — Config-Editing ist der MVP-Weg.)
- **Voll cross-checkbare verzweigte Graphen** — der MVP-Intent-Cross-Check ist flach
  (lineare Ketten); verzweigte Graphen werden nur markiert/hervorgehoben, nicht voll gediffт.
- Anreicherung der StepType-Metadaten (Subkategorie, whenToUse, Beispiele, Risiko) ist
  **optional/inkrementell** — Story 3 funktioniert mit den vorhandenen `description`-
  Feldern. **Ausnahme:** der **Mindest-Annotations-Pass** (Rollen-Marker Token/Betrag/
  Empfänger/Richtung) ist **MVP-Pflicht**, weil `SummaryDecoder` und Allowlist-Guard darauf
  beruhen (siehe Backend-Änderungen).

## Further Notes

- **Abhängigkeitsreihenfolge (aus den Stories):** Story 1 → {2, 3, 4, 7} → {5, 6}.
  Story 7 (Schutzmechanismen) wird **gemeinsam mit Story 4 designt und vor/parallel zu
  4–6 umgesetzt** — sie ist deren Sicherheits-Gate, kein Anhang.
- **Review-Kadenz:** Security-Review-Gate **vor Auslieferung jeder schreibenden Story**
  (4, 5, 6) und der Schutzmechanismen (7), inkl. Key-Handling-Review (Story 1) und
  Prompt-Injection-Szenario (Story 7).
- **Tracer-Bullet-Empfehlung für Slicing:** ein vertikaler Durchstich zuerst — Story 1
  (Auth) + ein Read-Tool (Story 2) → dann das Confirm-Gate-Skelett (Story 7) + Vault
  erstellen (Story 4) → dann AI-Building (Story 5) und der Rest der Geldbewegung (Story 6).
- **Erfolgskriterien (aus dem Epic):** aktive MCP-Nutzer; Anzahl über den KI-Assistenten
  gebauter, erfolgreich deployter Automations; Time-to-first-automation (MCP- vs.
  Editor-Pfad); Erfolgsrate KI-Graphen (Boundary-Bestehensquote). Guardrail: **0**
  Key-Leaks / Fremd-Vault-Zugriffe, **0** schreibende Aktionen ohne erzwungene Bestätigung.
- **Offene Detailpunkte fürs Refinement:** konkretes Wording des Erst-Verbindungs-
  Sicherheitshinweises; genaue Felder/Tiefe der Read-Tool-Ausgaben **und** des flachen
  Intent-Schemas; Default-Schwelle des Max-Betrag-Limits; Format/Pfad **und Tamper-Schutz
  (Hash-Kette?)** der lokalen Audit-Log-Datei; TTL/Größe des in-memory Draft-Stores; ob
  Story 6 in 6a (Geldbewegung) und 6b (Lifecycle/Gas-Deposit) gesplittet wird.
