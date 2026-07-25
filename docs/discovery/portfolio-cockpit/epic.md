---
created: 2026-07-25
last_verified: 2026-07-25
git_commit: 7ca671beafc34c201d4980a6ef66297bec67aa7f
extrahiert: aus-bestandscode
---

# Epic: Portfolio-Cockpit — Vault-Übersicht, Bewertung, Historie

> Reverse-Spec (Black-Box-Contract), rekonstruiert aus Bestandscode. Belege sind
> Datei-Pfade relativ zur Repo-Wurzel. Verhalten im Zweifel gegen den Code prüfen.

## Einseiter

Der eingeloggte Vault-Besitzer sieht auf dem **Dashboard** alle seine registrierten
Vaults mit Label, Deposit-Token, Erstellungsdatum und aggregiertem USD-Wert. Auf der
**Vault-Detail-Seite** sieht er (1) die Token-Positionen des Vaults mit Balance, Preis,
USD-Wert und Preisquelle, (2) das **Cockpit**: eine protokollübergreifende
Netto-Equity-Sicht aus unallokierten Token, Gas-Reserve und Protokoll-Positionen
(Aave V3, PancakeSwap V3) inkl. Metriken (Health Factor, APY, LP-Range, Earnings),
(3) den **Wertverlauf** als Chart aus stündlichen Snapshots mit
Deposit/Withdraw-Markern, (4) die **Performance**: flow-adjustierte PnL gegen
Netto-Einzahlungen plus Kosten (Fees + Gas), und (5) die **einheitliche Historie** aus
Ausführungen, Boundary-Events und Fehlschlägen — paginiert, filterbar pro Automation,
live per WebSocket. Alles ist strikt eigentümergebunden; Fremdzugriff wird serverseitig
mit 403/404 abgewehrt und clientseitig zum Dashboard umgeleitet. Alle externen
Datenquellen (Alchemy, DeFiLlama, RPC, Protokoll-Reads) degradieren einzeln — die
Ansicht als Ganzes bleibt nutzbar.

## Personas & Rollen

| Rolle | Beschreibung | Beleg |
|---|---|---|
| **Vault-Besitzer** (einzige Endnutzer-Rolle) | Per SIWE/JWT authentifizierte Wallet-Adresse (`req.user.address`). Sieht ausschließlich Vaults, deren `ownerAddress` seiner Adresse entspricht (checksummed verglichen). | `packages/backend/src/vault/vault-access.service.ts`, `packages/backend/src/vault/vault-owner.guard.ts` |
| **Anonym / Öffentlich** | Darf nur die kuratierte Token-Allowlist lesen (`GET /tokens?protocol=…`, `@Public()`). Kein Zugriff auf Vault-/Portfolio-Daten. | `packages/backend/src/tokens/tokens.controller.ts` |
| **System: Snapshot-Loop** | Kein Nutzer, aber Akteur: bewertet stündlich alle bekannten Vaults und persistiert `VaultValueSnapshot`-Zeilen (Basis für Chart & PnL-Baseline). | `packages/backend/src/cockpit/snapshot.service.ts` |
| **System: Indexer/WS-Gateway** | Schreibt Executions/VaultEvents/Failures und pusht Live-Events in den Vault-Raum (Ownership-Check identisch zum HTTP-Guard). | `packages/backend/src/indexer/execution.service.ts`, `packages/frontend/src/hooks/use-executions-socket.ts` |

## Fachliche Regeln & Verbotsliste (was der Code erzwingt)

**Zugriff & Isolation**
- R1: Jeder per-Vault-Endpoint (`/portfolio`, `/positions`, `/value-history`, `/performance`, `/executions`, `PATCH /vaults/:address`) läuft durch `VaultOwnerGuard` → `VaultAccessService.assertOwnership`. Unbekannter Vault → 404 `VAULT_NOT_FOUND`; fremder Vault → 403 `NOT_VAULT_OWNER`. (`vault/vault-owner.guard.ts`, `vault/vault-access.service.ts`)
- R2: Adressen werden **checksummed** verglichen (`getAddress`); Groß-/Kleinschreibung kann nie zu falschem Allow/Deny führen. Syntaktisch ungültige Adressen ergeben sauber 404, nie einen 500. (`vault/vault-access.service.ts`)
- R3: HTTP-Guard und WebSocket-Gateway teilen sich denselben Ownership-Check — die No-Data-Leak-Grenze kann zwischen den Transporten nicht driften. (Kommentar + Konstruktion in `vault/vault-access.service.ts`)

**Vault-Registrierung**
- R4: Ein Vault wird nur registriert, wenn er on-chain in der Factory registriert ist (`isRegisteredVault`) **und** sein on-chain `owner()` der anmeldende Nutzer ist; sonst 400 (`VAULT_NOT_REGISTERED_ON_CHAIN` / `VAULT_OWNER_MISMATCH`). Ohne konfigurierten RPC/Factory: 400 `ON_CHAIN_VALIDATION_NOT_CONFIGURED` (Registrierung fail-closed). (`vault/vault.service.ts`)
- R5: Vault-Adresse global eindeutig (409 `VAULT_ALREADY_REGISTERED`); Label pro Besitzer eindeutig (409 `LABEL_ALREADY_EXISTS`), Default-Label `Vault #<n>`. (`vault/vault.service.ts`)

**Bewertung & Konsistenz**
- R6: **Eine Bewertungsquelle**: `ValuationService` speist sowohl die Live-`/positions`-Antwort als auch den Snapshot-Cron; `PerformanceService.currentValueUsd` liest dasselbe Positions-Lesemodell wie der Header — Header, Chart und PnL können nicht auseinanderlaufen. (`cockpit/valuation.service.ts`, `cockpit/performance.service.ts`)
- R7: Kein Doppelzählen: Token, die ein Protokoll-Adapter „beansprucht" (aTokens, Debt-Tokens, …), werden aus den Idle-Positionen herausgefiltert. (`cockpit/valuation.service.ts` → `claimedTokens`)
- R8: Die Gas-Reserve zählt als eigene Position zur Netto-Equity — ein Gas-Top-up erscheint nicht als Verlust. (`cockpit/valuation.service.ts` → `gasReservePosition`)
- R9: `totalValueUsd` summiert nur bepreisbare Positionen (`valueUsd ?? 0`); unbepreisbare Token tragen 0 bei und werden als `priceUsd/valueUsd = null` + `priceSource: 'unavailable'` ausgewiesen — nie geschätzt. (`portfolio/vault-portfolio.service.ts`)
- R10: Preis-Kaskade: Alchemy-Preis zuerst, sonst DeFiLlama (nur bei `confidence >= 0.5`), sonst `unavailable`. (`portfolio/vault-portfolio.service.ts`, `portfolio/price.service.ts`)

**PnL-Firewall**
- R11: Netto-Einzahlungen und Fees werden **ausschließlich** aus Boundary-`VaultEvent`s (DEPOSIT/WITHDRAW) berechnet; `ProtocolFlow` wird nie angefasst — Protokoll-interne Bewegungen können die PnL nicht verfälschen. Gas-Kosten kommen nur aus `Execution.gasCompUsd`. (`cockpit/performance.service.ts`, `cockpit/performance.ts`)
- R12: USD-Beträge der Boundary-Events sind zum Schreibzeitpunkt eingefroren; Legacy-Events mit `amountUsd = null` werden übersprungen (nicht nachbewertet). (`cockpit/performance.service.ts`)
- R13: Flow-adjustierte Fenster-PnL: `pnlAbs = (aktuell − Baseline) − NettoEinzahlungenImFenster`; eine Einzahlung mitten im Fenster kann sich nicht als Gewinn tarnen. `pnlPct = null`, wenn die Kapitalbasis ≤ 0 (kein Divide-by-zero, kein Unsinns-Prozent bei frischem/leergeräumtem Vault). (`cockpit/performance.ts`)

**Degradation statt Ausfall**
- R14: Jeder Protokoll-Adapter ist isoliert: wirft er, entsteht eine Fehler-Position (`kind: 'error'`) — die übrigen Positionen und die Gesamtansicht bleiben intakt. Gleiches Muster für Idle-Balances und Gas-Reserve. (`cockpit/valuation.service.ts`)
- R15: Externe API-Fehler (Alchemy nicht konfiguriert/HTTP-Fehler, DeFiLlama down, RPC-Fehler pro Token) ergeben leere Listen bzw. `null`-Preise — nie einen 500 an den Client. (`portfolio/alchemy.service.ts`, `portfolio/price.service.ts`)
- R16: Der Snapshot-Loop ist selbstheilend: ohne RPC-Provider dormant (Warnung, API läuft weiter), ein fehlgeschlagener Vault-Snapshot wird nur geloggt, ein Tick-Fehler crasht nie den Prozess; In-Flight-Guard verhindert überlappende Ticks. (`cockpit/snapshot.service.ts`)

**Eingabe-Klemmen & Limits**
- R17: `range` muss `24h | 7d | 30d | all` sein, sonst 400; Chart-Serien werden auf ≤ 200 Punkte gedünnt (erster und letzter Punkt bleiben exakt). (`cockpit/history.ts`, `cockpit/history.service.ts`)
- R18: Historien-Pagination: `page ≥ 1`, `pageSize` geklemmt auf 1…100 (Default 20); unparsebare Werte fallen auf Defaults zurück. (`indexer/execution.controller.ts`)
- R19: Caches begrenzen Fremd-API-Last: Portfolio 60 s, Bewertung 30 s TTL; `refresh=1` erzwingt Live-Neuberechnung (ephemer, nicht persistiert). (`portfolio/vault-portfolio.service.ts`, `cockpit/valuation.service.ts`, `cockpit/snapshot.service.ts`)
- R20: Snapshot-Retention: Zeilen älter als 90 Tage (konfigurierbar) werden gelöscht. (`cockpit/snapshot.service.ts`)
- R21: Token-Allowlist ist kuratiert und DB-gestützt: nur `enabled` Token des angefragten Protokolls (`aave` | `pancakeswap`); fehlender/unbekannter Protocol-Parameter → 400. (`tokens/tokens.controller.ts`, `tokens/tokens.service.ts`)

## Anforderungen

### A1 — Vault-Übersicht mit Gesamtwert (Dashboard)

**Rolle/Fähigkeit/Zweck:** Als Vault-Besitzer sehe ich alle meine Vaults mit USD-Gesamtwert, um mein Portfolio auf einen Blick zu erfassen.

**Fachliche Kriterien:**
- Normalfall: `GET /vaults/overview` liefert pro Vault `address, label, depositToken, chainId, totalValueUsd, createdAt`; nur Vaults des eingeloggten Nutzers, sortiert nach `createdAt` absteigend. Das Dashboard rendert sie als klickbare Tabelle (Klick → `/vault/:address`), Beträge als `$x,xxx.xx`, Adressen trunkiert (`0x1234…abcd`). Beleg: `packages/backend/src/portfolio/portfolio.controller.ts`, `packages/backend/src/vault/vault.service.ts` (listVaults), `packages/frontend/src/pages/dashboard.tsx`
- Randfall leeres Portfolio: 0 Vaults → Empty-State „You don't have any vaults yet." mit CTA „Create Your First Vault". Beleg: `packages/frontend/src/pages/dashboard.tsx`
- Randfall unbepreisbarer Vault-Inhalt: Balances ohne Preisquelle → Vault erscheint mit `totalValueUsd` ohne diesen Anteil (Summe nur über bepreiste Positionen). Beleg: `packages/backend/src/portfolio/vault-portfolio.service.ts`
- Randfall Chain/API nicht erreichbar: Alchemy-Fehler pro Adresse → leere Positionsliste → Vault erscheint mit $0.00 statt Fehler; Batch läuft in 2er-Schritten weiter. Beleg: `packages/backend/src/portfolio/alchemy.service.ts`
- Fehlerfall Ladefehler im Frontend: Fehlerbanner „Failed to load vaults" mit Retry-Button; währenddessen Skeleton-Loader. Beleg: `packages/frontend/src/pages/dashboard.tsx`

### A2 — Vault registrieren & Label verwalten

**Rolle/Fähigkeit/Zweck:** Als Vault-Besitzer registriere ich einen on-chain erstellten Vault im Backend und benenne ihn, damit er in meiner Übersicht auftaucht und wiedererkennbar ist.

**Fachliche Kriterien:**
- Normalfall: `POST /vaults` mit `address, chainId, depositToken, txHash, createdAtBlock, label?`; Adresse wird checksummed gespeichert; ohne Label wird `Vault #<Anzahl+1>` vergeben. Beleg: `packages/backend/src/vault/vault.service.ts`
- Normalfall Umbenennen: `PATCH /vaults/:address` (nur Eigentümer); im Frontend Inline-Edit der Überschrift (Enter speichert, Escape bricht ab, Blur speichert). Beleg: `packages/backend/src/vault/vault.controller.ts`, `packages/frontend/src/pages/vault/detail.tsx`
- Fehlerfall ungültige Adresse: 400 `INVALID_VAULT_ADDRESS`. Beleg: `packages/backend/src/vault/vault.service.ts`
- Fehlerfall Duplikat: 409 `VAULT_ALREADY_REGISTERED` (Adresse) bzw. 409 `LABEL_ALREADY_EXISTS` (Label pro Besitzer, sowohl bei Create als auch Rename); UI zeigt „Label already in use". Beleg: `packages/backend/src/vault/vault.service.ts`, `packages/frontend/src/pages/vault/detail.tsx`
- Fehlerfall fremder/nicht registrierter Vault: on-chain-Validierung schlägt fehl → 400 `VAULT_NOT_REGISTERED_ON_CHAIN` / `VAULT_OWNER_MISMATCH`; ohne RPC-Konfiguration → 400 `ON_CHAIN_VALIDATION_NOT_CONFIGURED` (fail-closed). Beleg: `packages/backend/src/vault/vault.service.ts`

### A3 — Token-Positionen eines Vaults mit Preisquellen-Transparenz

**Rolle/Fähigkeit/Zweck:** Als Vault-Besitzer sehe ich die ERC-20-Positionen eines Vaults mit Balance, Preis, USD-Wert und Herkunft des Preises, um den Vault-Inhalt zu prüfen.

**Fachliche Kriterien:**
- Normalfall: `GET /vaults/:address/portfolio` (Owner-Guard) liefert `positions[]` mit `symbol, name, decimals, balance` (Basiseinheiten als String), `priceUsd, valueUsd, priceSource ∈ {alchemy, defi-llama, unavailable}` und `totalValueUsd`. UI sortiert nach `valueUsd` absteigend; DeFiLlama-Preise tragen ein gelbes Badge, unbepreiste „N/A"; Balances < 0.001 werden als `<0.001` angezeigt. Beleg: `packages/backend/src/portfolio/vault-portfolio.service.ts`, `packages/frontend/src/pages/vault/detail.tsx`
- Randfall leerer Vault: leere Positionsliste → „No token positions found in this vault."; Null-Balances werden serverseitig herausgefiltert. Beleg: `packages/frontend/src/pages/vault/detail.tsx`, `packages/backend/src/portfolio/alchemy.service.ts`
- Randfall fremder Vault: Backend antwortet 403 → Frontend leitet kommentarlos auf `/dashboard` um. Beleg: `packages/backend/src/vault/vault-access.service.ts`, `packages/frontend/src/pages/vault/detail.tsx`
- Randfall Dev/Fork-Umgebung: `NODE_ENV=development` liest Balances direkt per RPC über Fallback-Token (USDT/WBNB/BUSD) + alle enabled `ProtocolToken` aus der DB; Preise dann `null` (DeFiLlama-Fallback greift). Nicht existente Token auf dem Fork werden still übersprungen. Beleg: `packages/backend/src/portfolio/alchemy.service.ts`
- Fehlerfall Preis-API down: DeFiLlama-Fehler/HTTP-Fehler → leere Preis-Map → `priceSource: 'unavailable'`, `valueUsd: null`; Antwort bleibt 200. Beleg: `packages/backend/src/portfolio/price.service.ts`
- Frische: Antworten sind bis 60 s gecacht (pro Vault). Beleg: `packages/backend/src/portfolio/vault-portfolio.service.ts`

### A4 — Cockpit: protokollübergreifende Netto-Equity-Positionen

**Rolle/Fähigkeit/Zweck:** Als Vault-Besitzer sehe ich alles, was mein Vault hält — idle Token, Gas-Reserve, Aave-V3- und PancakeSwap-V3-Positionen — als eine USD-bewertete Netto-Equity-Sicht.

**Fachliche Kriterien:**
- Normalfall: `GET /vaults/:address/positions` (Owner-Guard) liefert `positions[]` (je `protocol, kind, label, legs[], valueUsd, debtUsd?, earningsUsd?, metrics?, error?`), `totalValueUsd` (Netto-Equity, Debt-Legs abgezogen), `asOfBlock, asOf` und `source ∈ {snapshot, live}`. Default wird der letzte Snapshot serviert; `?refresh=1` erzwingt eine Live-Neuberechnung (ephemer). Beleg: `packages/backend/src/cockpit/cockpit.controller.ts`, `packages/backend/src/cockpit/snapshot.service.ts`, `packages/backend/src/cockpit/protocol-adapter.ts`
- Normalfall UI: Positionen gruppiert nach Protokoll in fester Reihenfolge (idle, gas-reserve, aave-v3, pancakeswap-v3), Metriken-Zeile (Health Factor — `∞` bei null —, Supply-/Borrow-APY, In/Out of range, Fee-Tier, Unclaimed Fees, Earnings), LP-Range als menschenlesbare Preisspanne (invertiert, wenn < 1), Alter der Daten („updated 5m ago", Präfix „Live · " bei Live-Quelle), Refresh-Button. Negative Werte rot. Beleg: `packages/frontend/src/components/cockpit-positions-panel.tsx`
- Randfall Kaltstart (noch kein Snapshot): Live-Bewertung wird ad hoc berechnet, damit die Seite nicht leer ist (nicht persistiert). Beleg: `packages/backend/src/cockpit/snapshot.service.ts` (getPositionsView)
- Randfall leerer Vault: keine Positionen und Gesamtwert 0 → „No positions yet. Deposit funds or deploy an automation to get started." Beleg: `packages/frontend/src/components/cockpit-positions-panel.tsx`
- Randfall kaputtes Protokoll: wirft ein Adapter, erscheint eine rote Fehler-Zeile („Failed to read <protocol> positions") — die übrigen Gruppen bleiben vollständig; gleiches für Idle-Balances und Gas-Reserve. Beleg: `packages/backend/src/cockpit/valuation.service.ts`
- Randfall Doppelzählung: von Adaptern beanspruchte Token (aTokens etc.) erscheinen nicht zusätzlich als idle. Beleg: `packages/backend/src/cockpit/valuation.service.ts`
- Randfall Gas-Reserve: nur sichtbar, wenn aktiviert und > 0; Preisfehler degradiert zur Fehler-Zeile statt zum Ausfall. Beleg: `packages/backend/src/cockpit/valuation.service.ts`

### A5 — Wertverlauf über die Zeit (Chart)

**Rolle/Fähigkeit/Zweck:** Als Vault-Besitzer sehe ich die USD-Wertentwicklung meines Vaults als Kurve mit Deposit/Withdraw-Markern, um Wertveränderungen zeitlich einzuordnen.

**Fachliche Kriterien:**
- Normalfall: `GET /vaults/:address/value-history?range=24h|7d|30d|all` (Default 30d, Owner-Guard) liefert `points[]` (≤ 200, gleichmäßig gedünnt, Endpunkte exakt), `markers[]` (DEPOSIT/WITHDRAW mit eingefrorenem `amountUsd`) und `historyStartsAt` (erster Snapshot je Vault, treibt „History since <Datum>"). Datengrundlage: stündliche Snapshots (Intervall/Concurrency/Retention per Env konfigurierbar, Default 1 h / 4 / 90 d). Beleg: `packages/backend/src/cockpit/history.service.ts`, `packages/backend/src/cockpit/history.ts`, `packages/backend/src/cockpit/snapshot.service.ts`
- Normalfall UI: SVG-Kurve, Marker als gestrichelte Vertikallinien (grün = Deposit, rot = Withdraw) mit Tooltip (Typ, USD, Datum); Marker außerhalb des Kurvenzeitraums werden nicht gezeichnet. Zeitraum-Umschalter ist mit der Performance-Karte geteilt (ein gemeinsamer State, Default 30d). Beleg: `packages/frontend/src/components/value-history-chart.tsx`, `packages/frontend/src/pages/vault/detail.tsx`
- Randfall zu wenig Historie: < 2 Punkte → „Not enough history yet — snapshots are still being collected." Beleg: `packages/frontend/src/components/value-history-chart.tsx`
- Randfall Loop ohne RPC: Snapshot-Loop dormant → es entstehen keine neuen Punkte; API bleibt funktionsfähig. Beleg: `packages/backend/src/cockpit/snapshot.service.ts`
- Fehlerfall ungültige Range: 400 „range must be one of 24h, 7d, 30d, all". Beleg: `packages/backend/src/cockpit/history.service.ts`

### A6 — Performance / PnL mit Kostenausweis

**Rolle/Fähigkeit/Zweck:** Als Vault-Besitzer sehe ich meine flow-adjustierte PnL (absolut und prozentual) sowie meine Kosten (Fees + Gas) pro Zeitraum, um den echten Strategie-Erfolg zu beurteilen.

**Fachliche Kriterien:**
- Normalfall: `GET /vaults/:address/performance?range` (Default `all`, Owner-Guard) liefert `currentValueUsd` (aus demselben Positions-Lesemodell wie A4), `netDepositsUsd` (Σ Deposit − Σ Withdraw, nur Boundary-Events, eingefrorene USD), `pnlAbsUsd`, `pnlPct`, `costsUsd` (Deposit/Withdraw-Fees via `feeBps` + Σ `Execution.gasCompUsd`). Fenster-Formel: `(aktuell − Baseline@Fensterstart) − NettoEinzahlungenImFenster`; Baseline ist der Snapshot ≤ Cutoff; `all` reduziert exakt auf All-time-PnL. Beleg: `packages/backend/src/cockpit/performance.service.ts`, `packages/backend/src/cockpit/performance.ts`
- Normalfall UI: 4 Kacheln (PnL grün/rot mit Vorzeichen, Current value, Net deposits, Costs); Prozent „—" wenn `pnlPct = null`. Beleg: `packages/frontend/src/components/performance-card.tsx`
- Randfall frischer/leergeräumter Vault: Kapitalbasis ≤ 0 → `pnlPct = null` (kein Divide-by-zero, keine Unsinns-Prozente). Beleg: `packages/backend/src/cockpit/performance.ts`
- Randfall Legacy-Events: `amountUsd = null` → Event wird in Netto-Einzahlungen und Fees übersprungen (dokumentierter Follow-up: historischer Backfill). Beleg: `packages/backend/src/cockpit/performance.service.ts`
- Verbot (Firewall): Protokoll-Flows (`ProtocolFlow`) fließen nie in die PnL ein. Beleg: `packages/backend/src/cockpit/performance.service.ts` (Kommentar + Query-Konstruktion), `packages/backend/src/cockpit/performance.ts`
- Fehlerfall ungültige Range: 400 (gleiche Validierung wie A5). Beleg: `packages/backend/src/cockpit/performance.service.ts`

### A7 — Einheitliche Aktivitäts-Historie mit Live-Updates

**Rolle/Fähigkeit/Zweck:** Als Vault-Besitzer sehe ich alle Aktivitäten meines Vaults — erfolgreiche Automations-Ausführungen, Deposits/Withdraws und Fehlschläge — in einer chronologischen, paginierten Tabelle, die sich live aktualisiert.

**Fachliche Kriterien:**
- Normalfall: `GET /vaults/:address/executions?automationId&page&pageSize` (Owner-Guard) liefert eine UNION aus `Execution` + `VaultEvent` (DEPOSIT/WITHDRAW) + `ExecutionFailure` als einheitliche Zeilen (`kind ∈ {execution, vault_event, failure}`), sortiert nach `blockTimestamp DESC, logIndex DESC`, mit `total/page/pageSize`. Fehlschläge sortieren stabil nach `firstFailedAt` und tragen `failureStatus ∈ {open, resolved}`, `errorMessage`, `attemptCount`. Beleg: `packages/backend/src/indexer/execution.service.ts`, `packages/backend/src/indexer/execution.controller.ts`
- Normalfall UI: Badges (Deposit/Withdrawal/Success/Failed/Resolved), Beträge über Fee-Token-Metadaten aus `GET /tokens/accepted` formatiert (Fallback 18 Decimals), Kostenspalte (Gas-Kompensation bzw. Fee + %), TX-Hash als BscScan-Link (chainId 97 → Testnet), Pagination à 20 Zeilen, Filter-Dropdown pro deployter Automation. Beleg: `packages/frontend/src/components/execution-history-table.tsx`, `packages/backend/src/blockchain/blockchain.controller.ts`
- Normalfall Live: WebSocket-Namespace `/executions`, JWT via Auth-Callback (frischer Token je Reconnect), Subscribe auf den Vault-Raum; eingehendes Event → Toast + Sprung auf Seite 1 + Reload; jeder (Re-)Connect löst einen Gap-Fill-Reload aus (Socket.IO replayt nicht). Beleg: `packages/frontend/src/hooks/use-executions-socket.ts`
- Randfall Filter: mit `automationId` werden Vault-Events ausgeschlossen (Deposits/Withdraws gehören zu keiner Automation). Beleg: `packages/backend/src/indexer/execution.service.ts`
- Randfall Verbindung weg: ohne Socket-Verbindung pollt die Tabelle alle 15 s per REST; ein Freshness-Indikator zeigt Verbindungsstatus + letzten indexierten Block (Status-Poll alle 10 s). Beleg: `packages/frontend/src/components/execution-history-table.tsx`
- Randfall keine Aktivität: „No activity yet." Beleg: `packages/frontend/src/components/execution-history-table.tsx`
- Fehlerfall Pagination-Missbrauch: `pageSize` wird auf 1…100 geklemmt, `page` auf ≥ 1; unparsebares → Defaults (20/1). Unbekannter Vault → 400 `VAULT_NOT_FOUND` (in der Praxis fängt der Guard vorher mit 404/403 ab). Beleg: `packages/backend/src/indexer/execution.controller.ts`, `packages/backend/src/indexer/execution.service.ts`

### A8 — Token-Metadaten-Allowlist

**Rolle/Fähigkeit/Zweck:** Als (auch nicht eingeloggter) Client erhalte ich die kuratierte Token-Liste eines Protokolls (Adresse, Symbol, Decimals), damit Beträge korrekt in Basiseinheiten konvertiert und angezeigt werden.

**Fachliche Kriterien:**
- Normalfall: `GET /tokens?protocol=aave|pancakeswap` (öffentlich) → `{ tokens: [{ address, symbol, decimals }] }`, nur `enabled` Einträge, alphabetisch nach Symbol. Beleg: `packages/backend/src/tokens/tokens.controller.ts`, `packages/backend/src/tokens/tokens.service.ts`
- Fehlerfall: fehlender `protocol`-Parameter oder unbekanntes Protokoll → 400 mit Liste der erlaubten Werte; Groß-/Kleinschreibung wird normalisiert. Beleg: `packages/backend/src/tokens/tokens.controller.ts`
- Abgrenzung: die Historie-Tabelle nutzt zusätzlich `GET /tokens/accepted` (Fee-Token, Blockchain-Modul) für Betragsformatierung. Beleg: `packages/backend/src/blockchain/blockchain.controller.ts`, `packages/frontend/src/components/execution-history-table.tsx`

### A9 — Gas-Reserve einsehen und auffüllen (on-chain)

**Rolle/Fähigkeit/Zweck:** Als Vault-Besitzer sehe ich die Gas-Reserve meines Vaults (Fee-Token, hinterlegter Betrag, Mindestbetrag) und kann sie per Wallet-Transaktion auffüllen, damit Automationen ausführbar bleiben.

**Fachliche Kriterien:**
- Normalfall: Karte lädt `GET /vaults/:address/gas-deposit` + Automations-Liste; Auffüllen ruft `depositFees(token, amount)` direkt am Vault-Contract über wagmi (`useWriteContract`) auf — die Schreib-Transaktion läuft über die Wallet des Nutzers, nicht übers Backend. Warnlogik (`shouldWarnGasDeposit`) verknüpft Reserve-Stand mit deployten Automationen. Beleg: `packages/frontend/src/components/gas-deposit-card.tsx`, `packages/frontend/src/lib/gas-deposit.ts`
- Randfall: dieselbe Reserve erscheint im Cockpit (A4) als bewertete Position — Quelle ist serverseitig `FeeService.getVaultGasDeposit`. Beleg: `packages/backend/src/cockpit/valuation.service.ts`
- Fehlerfall Ladefehler: „Failed to load gas deposit" in der Karte, restliche Seite unberührt. Beleg: `packages/frontend/src/components/gas-deposit-card.tsx`

## Out of Scope

- **Graph-/Automation-Editor** (`packages/frontend/src/features/automation-editor/**`, Step-Katalog, Deploy-Flow) — eigener Discovery-Agent.
- **Auth-Flow** (SIWE-Login, JWT-Ausgabe/-Refresh, `packages/backend/src/auth/**`, `pages/connect.tsx`) — eigener Discovery-Agent; hier nur als Voraussetzung (`req.user.address`) referenziert.
- Deposit-/Withdraw-Transaktionslogik im Detail (`deposit-form.tsx`, `withdraw-form.tsx`, `use-approve-and-deposit.ts`, `use-withdraw.ts`) — hier nur als Auslöser des Portfolio-Refetch relevant.
- Indexer-Schreibseite (Event-Ingestion, `ProtocolFlow`-Erfassung, Failure-Ingest) und Automations-Ausführung selbst.
- MCP-Server-Sicht auf dieselben Daten.

## Annahmen & offene Fragen

- **Annahme:** `GET /vaults/overview` ist absichtlich nur JWT-geschützt ohne per-Vault-Guard, da es ausschließlich über `listVaults(req.user.address)` eigene Vaults expandiert — die Isolation entsteht durch die Query, nicht durch einen Guard. (`portfolio/portfolio.controller.ts`)
- **Annahme:** Die „unknown vault"-Zweige in `HistoryService`/`PerformanceService` (leere Serie bzw. Nullwerte) sind defensiv toter Code, weil `VaultOwnerGuard` vorher 404 wirft; als Contract gilt daher 404/403 vor leerer Antwort.
- **Annahme:** Die USD-Summe des einfachen Portfolios (A3) und die Cockpit-Netto-Equity (A4) dürfen abweichen (A4 rechnet Adapter-Positionen, Debt und Gas-Reserve ein; A3 nur idle ERC-20s). Die Vault-Detail-Seite zeigt derzeit **beide** Werte („Total Value" oben aus A3, „Positions"-Summe aus A4) — ob das fachlich gewollt oder ein UI-Altbestand ist, ist offen.
- **Offen:** Historischer USD-Backfill für Legacy-Boundary-Events (`amountUsd = null`) ist im Code als Follow-up dokumentiert, aber nicht umgesetzt — bis dahin sind Netto-Einzahlungen/Fees für Alt-Events systematisch untererfasst. (`cockpit/performance.service.ts`)
- **Offen:** Preisvertrauen: DeFiLlama-Preise unter `confidence 0.5` werden verworfen; ein Schwellwert-Rationale ist nicht dokumentiert. (`portfolio/price.service.ts`)
- **Offen:** `GET /vaults/:address/portfolio` und `/overview` bepreisen im Dev-Modus via RPC + DeFiLlama; ob Produktionsparität (Alchemy `bnb-mainnet` hart verdrahtet) für weitere Chains geplant ist, ist aus dem Code nicht ablesbar. (`portfolio/alchemy.service.ts`)
- **Offen:** Der Chart hat keine Fehler-Differenzierung zwischen „keine Snapshots, weil Loop dormant" und „Vault ist neu" — beide zeigen denselben Empty-State. (`value-history-chart.tsx`)
