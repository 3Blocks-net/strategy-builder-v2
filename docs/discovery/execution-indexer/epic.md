---
created: 2026-07-25
last_verified: 2026-07-25
git_commit: 7ca671beafc34c201d4980a6ef66297bec67aa7f
extrahiert: aus-bestandscode
---

# Epic: execution-indexer — Ausführungs-Indexer + Keeper-Failure-Ingest

> **Reverse-Spec (Black-Box-Contract), rekonstruiert aus Bestandscode.** Belege verweisen auf den Stand von Commit `7ca671b`. Beschrieben wird beobachtbares Verhalten, keine Implementierungsdetails.

## Einseiter

Das Backend indiziert die Vault-Aktivität der Chain in die eigene Datenbank, damit Vault-Besitzer eine vollständige, reorg-sichere Historie sehen. Ein Poll-Loop (Intervall `INDEXER_POLL_INTERVAL_MS`, Default 6000 ms) liest über die per `RPC_URL` konfigurierte Chain vier Event-Typen aller Vault-Proxies in einem einzigen adresslosen `getLogs`-Aufruf: `AutomationExecuted`, `GasCompSettled`, `Deposited`, `Withdrawn`. Indiziert werden nur Blöcke bis `head − INDEXER_CONFIRMATIONS` (Default 5); der Fortschritt liegt als durabler Cursor in der DB (Feed `executions`), sodass der Indexer nach einem Neustart exakt bei `Cursor + 1` weitermacht. Backfill startet bei `INDEXER_START_BLOCK`, sonst beim ältesten bekannten Vault-Erstellungsblock, sonst beim Chain-Head. Zu große Blockfenster (RPC-Limit, z. B. BSC-Public-RPC) werden adaptiv halbiert statt übersprungen. Alle Schreibvorgänge sind idempotent auf `(txHash, logIndex)`; USD-Werte (Gas-Kompensation, Deposit-/Withdraw-Betrag) werden zum Schreibzeitpunkt eingefroren.

Weil Reverts keine Logs emittieren, existiert für Fehlschläge ein zweiter Kanal: der Keeper meldet sie per `POST /internal/executions/failures` mit dem Header `x-keeper-secret`. Der Endpunkt ist fail-closed — ist `KEEPER_INGEST_SECRET` serverseitig nicht gesetzt, wird jeder Aufruf abgelehnt. Pro `(Vault, Automation)` gibt es höchstens einen offenen Fehlschlag (weitere Meldungen erhöhen `attemptCount`); indiziert der Indexer später einen Erfolg derselben Automation, wird der offene Fehlschlag in derselben DB-Transaktion aufgelöst. Lesend stehen bereit: die paginierte Unified-History pro Vault (Erfolge + Deposits/Withdraws + Fehlschläge), ein Frische-Endpunkt (`GET /indexer/status`) und ein Echtzeit-WebSocket, der neue Erfolge nur an den Vault-Eigentümer pusht.

## Personas & Rollen

| Rolle | Beschreibung | Zugang |
|---|---|---|
| **Vault-Besitzer** | Endnutzer mit SIWE/JWT-Login; sieht ausschließlich die Historie eigener Vaults | REST (`VaultOwnerGuard`), WebSocket (JWT-Handshake + Ownership-Check beim Room-Join) |
| **Keeper** | Externer Ausführungs-Bot ohne JWT; meldet fehlgeschlagene Ausführungen/Trigger-Checks | `POST /internal/executions/failures` mit Shared-Secret-Header `x-keeper-secret` |
| **Betreiber** | Konfiguriert den Indexer per Env-Variablen (siehe `packages/backend/.env.example`); betreibt Mainnet und lokalen Hardhat-Fork | Env-Contract, Logs |
| **System (Indexer-Loop)** | Kein menschlicher Akteur; läuft im Backend-Prozess, darf beim Scheitern die API nie mit reißen | intern |

## Fachliche Regeln & Verbotsliste

Was der Code aktiv erzwingt:

1. **Fail-closed Ingest:** Ohne serverseitig gesetztes `KEEPER_INGEST_SECRET` wird **jeder** Aufruf des Failure-Ingest mit 401 `KEEPER_INGEST_NOT_CONFIGURED` abgelehnt; falsches/fehlendes Secret → 401 `INVALID_KEEPER_SECRET`. (`packages/backend/src/indexer/keeper-ingest.guard.ts`)
2. **Der Shared-Secret-Guard ist die einzige Hürde:** Der Endpunkt ist `@Public()` (bypasst den Wallet-`APP_GUARD`), das Secret ist die alleinige Autorisierung. (`packages/backend/src/indexer/failure-ingest.controller.ts`)
3. **Reorg-Sicherheit:** Indiziert werden nur Blöcke `<= head − INDEXER_CONFIRMATIONS`; liegt nichts außerhalb des Confirmation-Fensters, wird gar nichts gescannt (leere Range-Liste). (`packages/backend/src/indexer/range-planner.ts`)
4. **Idempotenz:** Executions, VaultEvents und ProtocolFlows sind DB-unique auf `(txHash, logIndex)`; doppelte Verarbeitung (Cursor-Replay, Neustart) erzeugt keine Duplikate. (`packages/backend/prisma/schema.prisma`, `persist*` in `indexer.service.ts`)
5. **Durabler Cursor, kein In-Memory-Vertrauen:** Fortschritt wird pro abgeschlossenem Blockfenster in der DB fortgeschrieben; Resume immer ab `Cursor + 1`. (`packages/backend/src/indexer/indexer-cursor.store.ts`)
6. **Fremd-Logs werden verworfen:** Die adresslose `getLogs`-Abfrage kann Logs fremder Contracts mit gleicher Signatur liefern; nur Logs von Vaults aus der DB (pro Tick frisch geladen) werden persistiert. (`indexer.service.ts`, `tick()`)
7. **Genau ein offener Fehlschlag pro `(Vault, Automation)`:** Wiederholte Meldungen kollabieren in eine Zeile (`attemptCount++`, Reason/Timestamp aktualisiert); erst nach Auflösung öffnet ein neuer Fehlschlag eine frische Zeile. (`failure-ingest.service.ts`)
8. **Atomare Cross-Channel-Kopplung:** Das Einfügen von Erfolgs-Zeilen und das Auflösen passender offener Fehlschläge geschieht in **einer** DB-Transaktion — es gibt kein Fenster, in dem Erfolg und offener Fehlschlag gleichzeitig sichtbar sind. (`indexer.service.ts`, `persist()`)
9. **Kein Daten-Leak über den WebSocket:** Handshake ohne gültiges JWT → Socket wird getrennt; Room-Join nur nach Ownership-Check; Ablehnungen unterscheiden nicht zwischen „Vault existiert nicht" und „gehört jemand anderem" (`SUBSCRIBE_REJECTED`). (`executions.gateway.ts`)
10. **Indexer darf die API nie crashen:** Startup-Fehler (DB/RPC unerreichbar) lassen den Loop nur ungestartet; Tick-Fehler werden geloggt und der nächste Tick läuft regulär; Protocol-Flow-Fehler brechen weder den Kern-Pfad noch den Cursor-Fortschritt. Ohne `RPC_URL` bleibt der Indexer komplett dormant. (`indexer.service.ts`, `indexer.module.ts`)
11. **Kein Endlos-Halbieren:** Ein 1-Block-Fenster wird beim RPC-Fehler nicht weiter geteilt — der echte Fehler wird durchgereicht. (`range-planner.ts`, `halve()`)

**Verbotsliste (aus dem Code abgeleitet):**
- Niemals unbestätigte Blöcke (innerhalb des Confirmation-Fensters) persistieren.
- Niemals Fehlschlag-Zeilen ohne gültiges Shared-Secret akzeptieren — auch nicht „offen by default", wenn kein Secret konfiguriert ist.
- Niemals Fehlschläge für unbekannte Vaults anlegen (400 `VAULT_NOT_FOUND`) oder mit unparsebarer Vault-Adresse (400 `INVALID_VAULT_ADDRESS`).
- Niemals Execution-Events an Nicht-Eigentümer pushen.
- Niemals denselben `(txHash, logIndex)` doppelt in Historien-Tabellen schreiben.

## Anforderungen

### A1 — Erfolgs-Indizierung mit Confirmation-Tiefe

**Rolle:** System (Indexer-Loop) · **Fähigkeit:** `AutomationExecuted`-Erfolge aller Vaults in `Execution`-Zeilen überführen · **Zweck:** vollständige, reorg-sichere Erfolgs-Historie.

**Fachliche Kriterien:**
- *Normalfall:* Pro `AutomationExecuted` entsteht eine `Execution`-Zeile mit Vault, `automationId`, Executor, `txHash`, Block, Log-Index und Block-Timestamp. Ein `GasCompSettled` derselben Transaktion (gleiche `automationId` + Executor) liefert `gasCompAmount`/`gasCompToken`; `gasCompUsd` wird zum Schreibzeitpunkt aus dem Preis-Service eingefroren. Beleg: `packages/backend/src/indexer/event-mapper.ts` (`buildExecutionRows`), `packages/backend/src/indexer/indexer.service.ts` (`persist`, `computeUsd`).
- *Randfall — Owner-Execution ohne Gas-Comp:* Fehlt das `GasCompSettled`, sind `gasCompAmount`/`gasCompToken`/`gasCompUsd` null. Beleg: `event-mapper.ts:132-133`.
- *Randfall — kein Preis/Token unbekannt:* USD-Wert bleibt null (kein Fehler); unbekannte Token-Decimals fallen auf 18 zurück. Beleg: `indexer.service.ts` (`computeUsd`, `decimalsOf`).
- *Randfall — Reorg-Schutz:* Nur Blöcke `<= head − INDEXER_CONFIRMATIONS` (Default 5) werden gescannt; liegen alle neuen Blöcke im Confirmation-Fenster, passiert nichts. Beleg: `range-planner.ts` (`plan`).
- *Randfall — Fremd-Logs:* Logs von Contracts, die kein bekannter Vault sind, werden verworfen (Known-Vault-Set wird pro Tick neu geladen — nach Boot angelegte Vaults werden ohne Neustart erfasst). Beleg: `indexer.service.ts:191-204`.
- *Fehlerfall — doppelte Verarbeitung:* Bereits vorhandene `(txHash, logIndex)` werden übersprungen (`skipDuplicates` + Vorab-Filter). Beleg: `indexer.service.ts` (`persist`), `prisma/schema.prisma` (`@@unique([txHash, logIndex])`).

### A2 — Deposit/Withdraw-Indizierung mit Fee-Ableitung

**Rolle:** System · **Fähigkeit:** `Deposited`/`Withdrawn` als `VaultEvent`-Zeilen persistieren · **Zweck:** Ein-/Auszahlungen inkl. Gebühren in der Unified-History.

**Fachliche Kriterien:**
- *Normalfall:* `Withdrawn` trägt die **exakte** Fee im Event; `feeBps` wird daraus rückgerechnet. `Deposited` trägt keine Fee → sie wird aus dem aktuellen `depositFeeBps` der FeeRegistry (`FEE_REGISTRY_ADDRESS`) abgeleitet (`fee = amount·bps/10000`); der Betrag wird zusätzlich in USD eingefroren. Beleg: `event-mapper.ts` (`buildVaultEventRows`), `indexer.service.ts` (`readDepositFeeBps`, `persistVaultEvents`).
- *Randfall — historisch geänderte Fee-Rate:* Die abgeleitete Deposit-Fee ist auf dem Fork exakt, auf Mainnet nur approximativ, falls die Rate sich seither geändert hat (dokumentierte Einschränkung). Beleg: Kommentar `event-mapper.ts:156-160`.
- *Randfall — Withdraw mit Betrag 0:* `feeBps` wird 0 (keine Division durch 0). Beleg: `event-mapper.ts:191`.
- *Fehlerfall — FeeRegistry nicht konfiguriert/erreichbar:* `depositFeeBps` fällt auf 0 zurück; die Indizierung läuft weiter. Beleg: `indexer.service.ts` (`readDepositFeeBps`).

### A3 — Durabler Cursor, Backfill-Start und Resume

**Rolle:** Betreiber/System · **Fähigkeit:** Fortschritt neustart-fest halten und den Backfill-Startpunkt steuern · **Zweck:** keine Lücken und keine Doppelarbeit über Prozess-Neustarts hinweg.

**Fachliche Kriterien:**
- *Normalfall:* Nach jedem abgeschlossenen Blockfenster wird der Cursor (Feed `executions`) auf `range.to` samt Block-Timestamp fortgeschrieben; nach Neustart wird ab `Cursor + 1` weitergescannt. Beleg: `indexer-cursor.store.ts`, `indexer.service.ts:222-223`.
- *Randfall — Erststart-Seeding:* Ohne existierenden Cursor gilt Priorität: `INDEXER_START_BLOCK − 1` (Env-Override) → `min(Vault.createdAtBlock) − 1` → Chain-Head (keine Vaults = kein Backfill). Ein vorhandener Cursor wird durch das Seeding nie überschrieben. Beleg: `indexer.service.ts` (`ensureCursorSeeded`), `indexer-cursor.store.ts` (`initIfMissing`).
- *Randfall — großes Backfill-Fenster:* Der Rückstand wird in Fenster von max. `INDEXER_MAX_RANGE` (Default 2000) Blöcken zerlegt und Fenster für Fenster abgearbeitet — der Cursor rückt pro Fenster vor, ein Absturz mitten im Backfill verliert höchstens das aktuelle Fenster. Beleg: `range-planner.ts` (`plan`), `indexer.service.ts` (`tick`).
- *Fehlerfall — Tick-Fehler vor Cursor-Advance:* Der Cursor bleibt stehen; das Fenster wird beim nächsten Tick erneut verarbeitet (Idempotenz fängt Doppelungen ab). Beleg: `indexer.service.ts` (`runOnce`).

### A4 — Robustheit gegen RPC-Limits und Betriebsstörungen

**Rolle:** System · **Fähigkeit:** RPC-Range-Fehler und Ausfälle überstehen, ohne Daten zu verlieren oder die API zu gefährden · **Zweck:** stabiler Betrieb auf BSC-Public-RPC und lokalem Fork.

**Fachliche Kriterien:**
- *Normalfall:* Der Loop pollt selbst-nachplanend alle `INDEXER_POLL_INTERVAL_MS` (Default 6000 ms); ein In-Flight-Flag verhindert überlappende Ticks bei langsamem RPC. Beleg: `indexer.service.ts` (`scheduleNext`, `runOnce`).
- *Randfall — RPC lehnt Fenster als zu groß ab:* Das Fenster wird rekursiv halbiert und die Hälften erneut abgefragt (adaptive-halving); erst ein 1-Block-Fenster reicht den echten Fehler durch. Beleg: `indexer.service.ts` (`fetchLogs`), `range-planner.ts` (`halve`).
- *Randfall — `RPC_URL` unset:* Kein Provider → Indexer deaktiviert sich mit Warnung, API läuft normal. Beleg: `indexer.module.ts` (Provider-Factory), `indexer.service.ts` (`onModuleInit`).
- *Randfall — `INDEXER_ENABLED=false`:* Loop bleibt dormant (genutzt von Integrationstests, die `tick()` manuell treiben). Beleg: `indexer.service.ts:86,105-113,171-174`.
- *Fehlerfall — Startup-/Tick-Fehler:* werden geloggt, crashen nie den Prozess; Protocol-Flow-Indizierung (Adapter-Logs, z. B. Aave) ist zusätzlich einzeln abgeschirmt, damit sie weder Kern-Pfad noch Cursor blockiert. Beleg: `indexer.service.ts:100-116,159-169,218-220,281-286`.

### A5 — Fork-Sonderfall `INDEXER_CONFIRMATIONS=0`

**Rolle:** Betreiber (lokale Entwicklung) · **Fähigkeit:** auf dem Hardhat-Fork ohne Confirmation-Tiefe indizieren · **Zweck:** ein idle Fork mined keine Folgeblöcke — mit Confirmations > 0 blieben Events dort für immer „unbestätigt".

**Fachliche Kriterien:**
- *Normalfall (Fork):* Mit `INDEXER_CONFIRMATIONS=0` wird bis einschließlich Head indiziert; Events erscheinen ohne weitere Blöcke. Beleg: `packages/backend/.env.example:28-32`, `range-planner.ts` (`plan` akzeptiert `confirmations = 0`).
- *Randfall — idle Fork:* Head unverändert und Cursor = Head → leere Range-Liste, der Tick ist ein No-op (kein Fehler, kein Log-Spam). Beleg: `range-planner.ts:35`, `indexer.service.ts:189`.
- *Fehlerfall — ungültige Konfiguration:* `confirmations < 0` oder `maxRange < 1` werfen sofort einen Fehler im Planner. Beleg: `range-planner.ts:30-31`.

### A6 — Keeper-Failure-Ingest (fail-closed)

**Rolle:** Keeper · **Fähigkeit:** fehlgeschlagene Ausführungen und Trigger-Checks melden · **Zweck:** Fehlschläge in die Historie bringen, obwohl Reverts keine On-Chain-Logs erzeugen (einziger Eingangspfad).

**Fachliche Kriterien:**
- *Normalfall:* `POST /internal/executions/failures` mit Header `x-keeper-secret` und Body (`vaultAddress`, `automationId`, `executorAddress`, `failurePath` ∈ {`execution`, `trigger-check`}, optional `txHash`, `errorData`, `errorMessageFallback`, `timestamp`) legt einen offenen `ExecutionFailure` an (`attemptCount = 1`) bzw. aktualisiert den vorhandenen offenen (`attemptCount++`, Reason/`lastFailedAt`/`lastTxHash`/Executor aktualisiert). Antwort: `{ id, attemptCount }`. Die Fehlermeldung wird aus den rohen Revert-Bytes dekodiert (bekannte Custom-Errors + `Error(string)`), mit Fallback auf die Keeper-Kurzmeldung. Beleg: `failure-ingest.service.ts`, `failure-ingest.controller.ts`, `blockchain/contract-error.service.ts`.
- *Randfall — fehlender Timestamp:* Serverzeit wird verwendet; nicht-checksummbare `executorAddress` wird beim Update ignoriert (alter Wert bleibt). Beleg: `failure-ingest.service.ts:45-46,60-61,83-89`.
- *Randfall — Auflösung durch Erfolg:* Indiziert der Indexer später einen Erfolg derselben `(Vault, Automation)`, wird `resolvedAt` gesetzt — atomar in derselben Transaktion wie das Erfolgs-Insert; ein nachfolgender Fehlschlag öffnet eine neue Zeile. Beleg: `indexer.service.ts:449-486`, `failure-ingest.service.ts:48-51`.
- *Fehlerfall — Auth:* `KEEPER_INGEST_SECRET` unset → 401 `KEEPER_INGEST_NOT_CONFIGURED` (fail closed); Header fehlt oder stimmt nicht → 401 `INVALID_KEEPER_SECRET`. Beleg: `keeper-ingest.guard.ts`.
- *Fehlerfall — Daten:* ungültige Vault-Adresse → 400 `INVALID_VAULT_ADDRESS`; unbekannter Vault → 400 `VAULT_NOT_FOUND`. Beleg: `failure-ingest.service.ts:34-42`.

### A7 — Lesbare Historie, Frische-Status und Echtzeit-Push

**Rolle:** Vault-Besitzer · **Fähigkeit:** Historie einsehen, Indexer-Frische prüfen, Erfolge live erhalten · **Zweck:** vollständiges, aktuelles Bild der Vault-Aktivität — nur für den Eigentümer.

**Fachliche Kriterien:**
- *Normalfall:* `GET /vaults/:address/executions` (JWT + `VaultOwnerGuard`) liefert die Unified-History (Erfolge + Deposits/Withdraws + Fehlschläge) absteigend nach Zeit, offset-paginiert (`page` ≥ 1, `pageSize` 1–100, Default 20); Fehlschläge tragen `failureStatus` `open`/`resolved` und sortieren stabil nach `firstFailedAt`. Mit `?automationId=` werden Deposits/Withdraws ausgeschlossen (gehören keiner Automation). Beleg: `execution.controller.ts`, `execution.service.ts`.
- *Normalfall — Frische:* `GET /indexer/status` (authentifiziert, global) liefert `lastProcessedBlock` + Timestamp — Server-Wahrheit statt Client-Schätzung; `null`-Werte, solange der Cursor nie initialisiert wurde. Beleg: `indexer-status.controller.ts`.
- *Normalfall — Echtzeit:* WebSocket-Namespace `/executions`: JWT im Handshake, `subscribe {vaultAddress}` nach Ownership-Check → Raum-Beitritt; neue Erfolge werden als `execution`-Events (mit `status:'success'`, Gas-Comp, USD, Timestamp) nur in den Raum des Vaults gepusht. Beleg: `executions.gateway.ts`.
- *Fehlerfall:* unbekannter Vault → 400 `VAULT_NOT_FOUND`; ungültiges Handshake-JWT → Socket-Disconnect; Subscribe auf fremden/nicht existierenden Vault → einheitlich `SUBSCRIBE_REJECTED` (kein Existenz-Leak). Beleg: `execution.service.ts:63-64`, `executions.gateway.ts:44-68`.

## Out of Scope

- **Keeper selbst** (Trigger-Evaluierung, Transaktions-Submission, Retry-Strategie) — der Indexer konsumiert nur dessen Failure-Meldungen.
- **On-Chain-Failure-Erkennung** — Reverts emittieren keine Logs; es gibt bewusst keinen Chain-Scan nach fehlgeschlagenen Transaktionen.
- **Historische USD-Kurse** — USD-Werte sind Schreibzeitpunkt-Snapshots (~Event-Zeit), keine nachträglich korrigierbaren historischen Preise.
- **Reorg-Rollback** — es gibt keine Löschung/Korrektur bereits persistierter Zeilen; Schutz ist ausschließlich präventiv über die Confirmation-Tiefe.
- **WebSocket-Push für Fehlschläge und Deposits/Withdraws** — der Gateway pusht nur Erfolgs-Zeilen.
- **Protokoll-spezifische Logik im Indexer-Kern** — Protocol-Flows (z. B. Aave Supply/Withdraw) kommen deklarativ aus Cockpit-Adaptern; der Kern bleibt protokoll-agnostisch.

## Annahmen & offene Fragen

**Annahmen (aus dem Code, nicht verifizierbar dokumentiert):**
- Es gibt genau einen Backend-Prozess pro Umgebung; der Cursor ist nicht gegen konkurrierende Indexer-Instanzen gesperrt (kein Locking erkennbar).
- Das Keeper-Secret wird über einen sicheren Kanal an den Keeper verteilt; Rotation ist nicht abgebildet (nur ein Wert, Vergleich per String-Gleichheit).
- `INDEXER_CONFIRMATIONS=5` gilt als ausreichende Reorg-Tiefe für BSC-Mainnet (Kommentar nennt den Trade-off „reorg safety vs 30s SLA", ohne Herleitung).

**Offene Fragen:**
1. Verhalten bei einem Reorg **tiefer** als `INDEXER_CONFIRMATIONS`: bereits persistierte Zeilen blieben stehen (kein Rollback) — akzeptiertes Restrisiko oder Lücke?
2. Der Timing-sichere Vergleich des Keeper-Secrets fehlt (`!==`-Stringvergleich in `keeper-ingest.guard.ts`) — bewusste Vereinfachung für einen internen Endpunkt?
3. Der Failure-Ingest hat keine Rate-Begrenzung/Deduplizierung pro Zeitfenster — kann ein fehlkonfigurierter Keeper `attemptCount` unbegrenzt hochtreiben (nur kosmetisch, oder fachlich relevant)?
4. `INDEXER_START_BLOCK` wirkt nur beim **Erst**-Seeding; ein späteres Ändern der Env-Variable hat keinen Effekt, solange der Cursor existiert — ist das dem Betrieb bewusst?
5. Flow-Subscriptions der Cockpit-Adapter werden nur einmal aufgelöst und gecacht (`flowSubs`) — neue Adapter-Subscriptions erfordern einen Neustart; gewollt?
