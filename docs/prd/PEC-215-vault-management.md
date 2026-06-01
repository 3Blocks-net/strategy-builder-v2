# PRD: Vault-Verwaltung (PEC-215)

## Problem Statement

DeFi-Anleger, die den Strategy Builder nutzen wollen, haben aktuell keine Moeglichkeit, einen isolierten On-Chain-Container (Vault) fuer ihre automatisierten Strategien zu erstellen und mit Kapital auszustatten. Ohne Vault gibt es keinen Ort, an dem Automationen mit den Tokens des Nutzers arbeiten koennen. Nutzer brauchen eine einfache, transparente Moeglichkeit, Vaults zu erstellen, Tokens ein- und auszuzahlen, und den Ueberblick ueber alle Vaults mit aktuellen Balances und USD-Gegenwerten zu behalten.

## Solution

Eine vollstaendige Vault-Verwaltung bestehend aus:

1. **Create-Vault-Wizard**: Multi-Step Flow (Label -> Deposit-Token -> Gebuehren-Vorschau -> On-Chain TX -> optionaler initialer Deposit), der einen ERC1967 Proxy via StrategyBuilderVaultFactory deployed.

2. **Dashboard mit Vault-Tabelle**: Tabellarische Uebersicht aller Vaults des Nutzers mit Name, Deposit-Token, Total Value (USD), und Status. Klick fuehrt zur Detailseite.

3. **Vault-Detailseite**: Zeigt alle ERC-20 Token-Balances im Vault (via Alchemy Portfolio API), USD-Gegenwerte (Alchemy primaer, DeFiLlama Fallback), Deposit/Withdraw-Formulare, und eine Transaktionshistorie (Deposits, Withdrawals).

4. **Backend-Portfolio-API**: NestJS-Services die Token-Balances, Metadata und Preise ueber die Alchemy Portfolio REST API aggregieren, mit DeFiLlama als Preis-Fallback. Erweiterbar fuer spaetere DeFi-Protokoll-Balances (Aave, PancakeSwap). Fee-BPS werden on-chain gelesen, gecached, und via API bereitgestellt.

## User Stories

1. Als Nutzer moechte ich einen neuen Vault erstellen, indem ich ein optionales Label vergebe und einen Deposit-Token aus den akzeptierten Tokens der FeeRegistry auswaehle, damit ich einen isolierten Container fuer meine Strategien habe.

2. Als Nutzer moechte ich vor der Vault-Erstellung eine Gebuehren-Vorschau sehen (Deposit/Withdraw BPS), damit ich informiert entscheiden kann.

3. Als Nutzer moechte ich nach der Vault-Erstellung optional direkt einen initialen Deposit taetigen (Approve + Deposit), damit ich den Vault sofort mit Kapital ausstatten kann.

4. Als Nutzer moechte ich waehrend der Vault-Erstellung und bei Deposits klares Feedback ueber den Transaktionsstatus bekommen (Wallet-Bestaetigung ausstehend, TX gesendet, Confirmation abwarten, Erfolg/Fehler), damit ich den Fortschritt verfolgen kann.

5. Als Nutzer moechte ich auf dem Dashboard eine Tabelle aller meiner Vaults sehen mit Name, Deposit-Token, Total Value in USD und Erstellungsdatum, damit ich schnell den Ueberblick behalte.

6. Als Nutzer moechte ich das Dashboard innerhalb von 3 Sekunden geladen sehen, damit die App sich responsiv anfuehlt.

7. Als Nutzer moechte ich auf eine Vault-Detailseite navigieren koennen, damit ich Details und Aktionen fuer einen bestimmten Vault sehe.

8. Als Nutzer moechte ich auf der Vault-Detailseite alle ERC-20 Token-Balances meines Vaults sehen (nicht nur den Deposit-Token), damit ich weiss, welche Assets im Vault liegen.

9. Als Nutzer moechte ich neben den Token-Balances auch die USD-Gegenwerte sehen, damit ich den Gesamtwert meines Vaults einschaetzen kann.

10. Als Nutzer moechte ich auf der Vault-Detailseite Tokens in meinen Vault einzahlen koennen, indem ich einen Token auswaehle, den Betrag eingebe, und die Gebuehren vor Bestaetigung sehe.

11. Als Nutzer moechte ich auf der Vault-Detailseite Tokens aus meinem Vault abheben koennen, wobei die Tokens immer an meine verbundene Wallet gehen und die Withdraw-Gebuehr transparent angezeigt wird.

12. Als Nutzer moechte ich eine Transaktionshistorie auf der Vault-Detailseite sehen (Deposits, Withdrawals) mit Zeitstempel, Betrag, und Gebuehren, damit ich Transparenz ueber alle Vault-Bewegungen habe. Ein Disclaimer weist darauf hin, dass die Historie moeglicherweise unvollstaendig ist (z.B. direkte On-Chain-Interaktionen), bis die Subgraph-Integration aktiv ist.

13. Als Nutzer moechte ich beim Deposit den ERC-20 Approve-Schritt verstehen (warum muss ich zweimal bestaetigen), damit ich nicht verunsichert abbreche.

14. Als Nutzer moechte ich bei einem fehlgeschlagenen Deposit oder Withdraw eine klare Fehlermeldung sehen (z.B. "Insufficient balance", "CallerNotOwner"), damit ich das Problem verstehen und beheben kann.

15. Als Nutzer moechte ich, dass bereits erteilte Token-Approvals erkannt werden, sodass ich nicht unnoetig erneut approven muss.

16. Als Nutzer moechte ich den Vault-Namen nachtraeglich aendern koennen, damit ich meine Vaults besser organisieren kann.

17. Als Nutzer moechte ich bei der Token-Auswahl (Create Wizard + Deposit) den Token-Namen, Symbol und mein Wallet-Balance sehen, damit ich weiss, wie viel ich einzahlen kann.

18. Als Nutzer moechte ich einen "Max"-Button beim Deposit haben, der automatisch mein volles Wallet-Balance fuer den gewaehlten Token eintraegt.

19. Als Nutzer moechte ich beim Withdraw einen "Max"-Button haben, der das volle Vault-Balance (Brutto-Betrag) fuer den gewaehlten Token eintraegt. Die Gebuehren und der Netto-Empfangsbetrag werden unterhalb des Eingabefelds angezeigt.

20. Als Backend-Entwickler moechte ich die Portfolio-Architektur (Alchemy + DeFiLlama) so aufbauen, dass spaeter DeFi-Protokoll-Balances (Aave, PancakeSwap LP) ueber dieselbe API ergaenzt werden koennen.

21. Als Nutzer moechte ich, dass Vaults ohne Label automatisch als "Vault #N" angezeigt werden (N = per-User sequentieller Zaehler), damit die Tabelle nie leer wirkt.

## Implementation Decisions

### Architecture: Backend-First for Balances & Prices

- Token-Balances, Metadata (Symbol, Name, Decimals, Logo) und USD-Preise werden ueber die **Alchemy Portfolio REST API** (`POST /data/v1/{apiKey}/assets/tokens/by-address`) im Backend gelesen — ein einziger Call liefert alles (`withMetadata: true`, `withPrices: true`). Auto-Discovery: keine explizite Token-Liste noetig.
- **DeFiLlama** (`coins.llama.fi/prices/current/bsc:0x...`) dient als **Preis-Fallback**, wenn Alchemy fuer einen Token keinen Preis liefert oder der Preis veraltet ist.
- Jede Position im Portfolio-Response enthaelt ein `priceSource`-Feld (`"alchemy"` | `"defi-llama"` | `"unavailable"`) fuer Debugging-Transparenz.
- **Portfolio-Daten werden im Backend gecached** (60 Sekunden TTL). Das Dashboard nutzt einen dedizierten `GET /vaults/overview` Endpoint, der Alchemy-Calls fuer alle Vaults batched (max 2 Adressen pro Alchemy-Request).
- **Keine neuen npm Dependencies** im Backend: Nativer `fetch` (Node.js 18+) + vorhandenes `ethers` fuer Formatierung.
- Das `alchemy-sdk` npm-Paket darf **nicht** verwendet werden (archiviert, stuck auf ethers v5).
- **Dev-Modus**: `NODE_ENV=development` schaltet den `AlchemyService` auf direkte RPC-Balance-Reads gegen den lokalen Hardhat-Node um (selbes Interface, andere Datenquelle). Entwicklung laeuft gegen einen **Hardhat Mainnet-Fork** mit Faucet fuer Test-Tokens.

### Frontend Contract Interactions (wagmi v2)

- **Vault erstellen**: `useSimulateContract` + `useWriteContract` + `useWaitForTransactionReceipt` gegen StrategyBuilderVaultFactory. VaultCreated Event aus Receipt parsen fuer neue Vault-Adresse.
- **ERC-20 Approve + Deposit**: `writeContractAsync` fuer sequentielle Transaktionen. **Infinite Approval** (`type(uint256).max`) — der Vault ist der eigene isolierte Contract des Nutzers, daher ist unbeschraenkte Genehmigung risikoarm und vermeidet wiederholte Approve-TXs. Vorher Allowance pruefen; falls Allowance > 0 aber nicht infinite: USDT-Style Reset-to-Zero Pattern beruecksichtigen.
- **Withdraw**: `useSimulateContract` (Fehler abfangen vor Wallet-Popup) + `useWriteContract`. Empfaenger ist immer die verbundene Wallet.
- **Fee-Anzeige**: Backend API liest `depositFeeBps`/`withdrawFeeBps` aus FeeRegistry on-chain, cached mit 1h TTL (aendert sich selten), stellt sie via REST bereit.
- **Accepted Tokens**: Aus FeeRegistry on-chain gelesen, cached mit 1h TTL. Deposit-Form zeigt nur akzeptierte Tokens. Withdraw-Form zeigt alle Tokens die der Vault haelt (aus Portfolio-Daten).
- **ABI-Definitionen**: Extrahiert aus Hardhat-Artifacts via **Build-Script** (post-compile) in `lib/abis/` mit `as const` fuer volle TypeScript-Inferenz. Custom Error Definitions (CallerNotOwner, TriggerNotMet, FeeTokenNotAccepted) muessen enthalten sein.
- **Contract Error Mapping**: Solidity Custom Errors werden im Backend auf menschenlesbare Meldungen gemappt und via `GET /errors/contract-errors` bereitgestellt. Das Frontend cached diese Map beim App-Start und dekodiert Error-Selektoren lokal.
- **Withdraw Betragseingabe**: Der Nutzer gibt den **Brutto-Betrag** ein. Unterhalb des Eingabefelds wird eine Aufschluesselung angezeigt: "Du erhaeltst: X (Gebuehr: Y)".
- **TX-Status Feedback**: Inline-Stepper fuer den mehrstufigen Approve+Deposit-Flow (Step 1/2: "Approving...", Step 2/2: "Depositing..."). Toast-Notifications fuer Single-TX-Flows (Create Vault, Withdraw).

### Wagmi Config Update (Teil von PEC-215)

- Aktueller Config nutzt bare `transports` -- Multicall-Batching ist nicht aktiv. Update auf `client` Factory mit `batch.multicall` und `pollingInterval: 2000` (BSC hat ~0.75s Bloecke).
- Fuer PEC-215 relevant: `useReadContract` fuer Allowance-Checks, `useReadContracts` fuer accepted Tokens aus FeeRegistry.

### Vault Synchronization (On-Chain -> DB)

- **MVP**: Frontend wartet auf TX-Confirmation, parsed VaultCreated Event, sendet `POST /vaults` an Backend mit Vault-Adresse, TX-Hash, Block-Nummer, Deposit-Token, Label. Bei Netzwerkfehlern **Retry mit exponentiellem Backoff** — im Fehlerfall wird dem Nutzer die Vault-Adresse angezeigt, damit die On-Chain-Referenz nicht verloren geht.
- **Spaeter**: Subgraph indexiert VaultCreated Events als Source of Truth. Backend gleicht ab.
- Backend validiert **zwei Bedingungen**: (1) `factory.isRegisteredVault(address)` — Vault existiert on-chain, und (2) `vault.owner() == authenticatedWallet` — verhindert, dass ein Nutzer fremde Vaults registriert.

### Backend Module Structure

- **BlockchainModule**: `AlchemyService` (REST-Client fuer Alchemy Portfolio API — Balances + Metadata + Preise; im Dev-Modus lokaler RPC-Fallback), `PriceService` (DeFiLlama Fallback fuer fehlende Preise), `FeeService` (FeeRegistry on-chain reads mit 1h Cache), `ContractErrorService` (Solidity Custom Error Mapping). Exportiert alle Services.
- **VaultModule**: `VaultService` (CRUD, DB-Operationen, On-Chain-Validierung), `VaultPortfolioService` (kombiniert AlchemyService + PriceService Fallback, 60s Cache), `VaultController` (REST Endpoints). Importiert BlockchainModule.
- **Authorization**: `VaultOwnerGuard` Decorator (analog zu `WalletAuthGuard`) — laedt Vault by `:address` Parameter, prueft `ownerAddress == JWT wallet`, gibt 403 bei Mismatch. Haelt Ownership-Checks aus Service-Logik raus.
- Beide Module registriert im AppModule.

### API Contract

Alle Vault-spezifischen Endpoints verwenden die **Vault-Adresse** als Identifier (nicht DB-UUID).

**POST /vaults** -- Vault in DB registrieren (nach On-Chain-Erstellung)
```
Body: { address, txHash, blockNumber, chainId, depositToken, label? }
Response: { id, address, label, depositToken, chainId, createdAt }
Validierung: isRegisteredVault(address) AND vault.owner() == authenticatedWallet
Labels: unique per User, Default "Vault #N" (per-User Zaehler)
```

**GET /vaults** -- Alle Vaults des authentifizierten Nutzers
```
Response: { vaults: [{ id, address, label, depositToken, chainId, createdAt }] }
```

**GET /vaults/overview** -- Dashboard-Uebersicht mit USD-Werten (batched Alchemy-Calls, 60s Cache)
```
Response: {
  vaults: [{ address, label, depositToken, chainId, totalValueUsd, createdAt }]
}
```

**PATCH /vaults/:address** -- Vault-Label aendern (VaultOwnerGuard)
```
Body: { label }
Response: { id, address, label, ... }
Validierung: Label unique per User
```

**GET /vaults/:address/portfolio** -- Balances + Preise fuer einen Vault (VaultOwnerGuard)
```
Response: {
  vaultAddress,
  positions: [{ tokenAddress, symbol, name, decimals, balance, balanceFormatted, priceUsd, valueUsd, priceSource }],
  totalValueUsd
}
priceSource: "alchemy" | "defi-llama" | "unavailable"
```

**POST /vaults/:address/events** -- VaultEvent erfassen (nach Deposit/Withdraw TX Confirmation, mit Retry+Backoff)
```
Body: { eventType: "DEPOSIT" | "WITHDRAWAL", token, amount, feeAmount, feeBps, txHash, blockNumber, blockTimestamp }
Response: { id, eventType, token, amount, feeAmount, feeBps, txHash, blockTimestamp }
```

**GET /vaults/:address/history** -- Transaktionshistorie (Deposits, Withdrawals)
```
Query: ?page=1&limit=20
Response: {
  events: [{ eventType, token, amount, feeAmount, feeBps, txHash, blockTimestamp }],
  total, page, limit
}
```

**GET /fees** -- Aktuelle Fee-Raten (1h Cache)
```
Response: { depositFeeBps, withdrawFeeBps }
```

**GET /tokens/accepted** -- Akzeptierte Tokens aus FeeRegistry (1h Cache)
```
Response: { tokens: [{ address, symbol, name, decimals }] }
```

**GET /errors/contract-errors** -- Solidity Custom Error Mapping (Frontend cached beim App-Start)
```
Response: { errors: { "CallerNotOwner": "You are not the owner of this vault", ... } }
```

### Prisma Schema Extension

Neues `Vault` Model wird zur bestehenden Schema hinzugefuegt (User, Nonce, RefreshToken existieren bereits):

- `Vault`: id, address (unique), chainId, ownerAddress (FK -> User.walletAddress), depositToken, label (unique per User), createdAtBlock, txHash, createdAt, updatedAt
- `VaultEvent`: id, vaultId (FK), eventType (DEPOSIT/WITHDRAWAL), token, amount, feeAmount, feeBps, txHash, blockNumber, blockTimestamp -- ein Row pro Transaktion, Fee-Info inline

Unique Constraint: `@@unique([ownerAddress, label])` — Labels muessen pro User eindeutig sein. Default-Label "Vault #N" wird per User-spezifischem Zaehler vergeben.

VaultEvent wird initial vom Frontend bei Deposit/Withdraw-Transaktionen via `POST /vaults/:address/events` erfasst (mit Retry+Backoff), spaeter via Subgraph automatisch.

### Frontend Page Structure

- `/dashboard` -- Vault-Tabelle (erweitert bestehende DashboardPage), nutzt `GET /vaults/overview`
- `/vault/create` -- Multi-Step Wizard (Label -> Token -> Fee Preview -> TX -> Optional Deposit)
- `/vault/:address` -- Vault-Detailseite (Balances, Deposit/Withdraw, Historie). Vault-Adresse als URL-Identifier (nicht DB-UUID).

### BSC-Specific Considerations

- Alle gaengigen BSC-Tokens verwenden 18 Decimals (USDT/USDC sind 18 auf BSC, nicht 6 wie auf Ethereum).
- Alchemy BSC Netzwerk-Identifier: `bnb-mainnet` (in RPC URLs).
- DeFiLlama Chain-Identifier: `bsc` (in Coin-IDs).
- BSC Gas-Estimation kann fehlerhaft sein -- 20% Buffer oder `simulateContract` vorher nutzen.

## Testing Decisions

### Testing Philosophy

- Tests pruefen **externes Verhalten**, nicht Implementation Details. Ein Test soll brechen wenn sich das Verhalten aendert, nicht wenn interner Code refactored wird.
- Service-Tests mocken externe Dependencies (Alchemy API, DeFiLlama API, Prisma), nicht interne Methoden.
- E2E-Tests nutzen eine echte Datenbank (Prisma Test-DB), mocken nur externe APIs.
- Frontend Hook-Tests mocken wagmi Hooks und Backend-API-Calls.
- Vorhandenes Test-Pattern im Backend: `auth.integration.spec.ts`, `signature.service.spec.ts`, `health.controller.spec.ts` als Referenz.

### Backend Unit Tests

- **AlchemyService**: Mock `fetch`, teste korrekte REST Request-Formatierung an Alchemy Portfolio API, Response-Parsing (Balances + Metadata + Preise), Fehlerbehandlung bei API-Fehlern, Dev-Modus RPC-Fallback.
- **PriceService**: Mock `fetch`, teste DeFiLlama Response-Parsing, fehlende Tokens, Confidence-Score-Handling (nur als Fallback aufgerufen).
- **VaultPortfolioService**: Mock AlchemyService + PriceService, teste Kombination mit DeFiLlama-Fallback wenn Alchemy keinen Preis liefert, `priceSource`-Feld korrekt gesetzt, Partial-Failure (Token hat keinen Preis → "unavailable"), 60s Cache-Verhalten.
- **FeeService**: Mock ethers Contract, teste BPS-Caching mit 1h TTL, Cache-Invalidierung.
- **VaultService**: Mock Prisma, teste CRUD-Operationen, Validierung (registeredVault-Check + owner-Check), Owner-Authorization, Label-Uniqueness per User, Default-Label "Vault #N" Vergabe.
- **ContractErrorService**: Teste Error-Mapping-Vollstaendigkeit, Response-Format.

### Backend E2E Tests

- **POST /vaults**: Authentifizierter Request, Vault wird in DB erstellt, unauthentifiziert gibt 401. Pruefe On-Chain-Validierung (isRegisteredVault + owner-Check).
- **GET /vaults**: Gibt nur Vaults des authentifizierten Nutzers zurueck.
- **GET /vaults/overview**: Mock Alchemy Portfolio API, pruefe batched Response mit totalValueUsd.
- **GET /vaults/:address/portfolio**: Mock externe APIs, pruefe Response-Shape inkl. `priceSource`. VaultOwnerGuard gibt 403 fuer fremde Vaults.
- **POST /vaults/:address/events**: Pruefe Event-Erstellung, VaultOwnerGuard.
- **GET /vaults/:address/history**: Pruefe Pagination, nur eigene Vault-Events.
- **PATCH /vaults/:address**: Pruefe Label-Update, Uniqueness-Constraint, VaultOwnerGuard.
- **GET /fees**: Pruefe Response-Shape, Caching-Verhalten.
- **GET /errors/contract-errors**: Pruefe Response-Shape.
- Referenz: `guard-refresh.integration.spec.ts` fuer Auth-bezogene E2E-Patterns.

### Frontend Hook Tests (Vitest + React Testing Library)

- **useCreateVault**: Mock `useWriteContract`, `useWaitForTransactionReceipt`. Teste Happy Path (simulate -> write -> confirm -> parse event), Error Path (simulation failure, user rejection).
- **useApproveAndDeposit**: Mock wagmi hooks. Teste Allowance-Check (skip approve wenn ausreichend), Approve-then-Deposit-Sequenz, USDT Reset-to-Zero.
- **useWithdraw**: Mock wagmi hooks. Teste simulate -> write -> confirm Flow, Fehleranzeige.
- Vorhandenes Pattern: `auth-context.test.tsx`, `connect.test.tsx` als Referenz.

### Frontend Component Tests (Vitest + React Testing Library)

- **CreateVaultWizard**: Teste Step-Navigation, Validierung (Label optional, Token Pflicht), Fee-Vorschau-Anzeige.
- **VaultTable**: Teste Rendering mit Mock-Daten, Leer-Zustand, Klick-Navigation zur Detailseite.
- **DepositForm/WithdrawForm**: Teste Betragseingabe, Max-Button, Fee-Berechnung, Button-States (disabled waehrend TX).
- Vorhandenes Pattern: `dashboard.test.tsx`, `protected-route.test.tsx` als Referenz.

## Out of Scope

- **Automation-Erstellung und -Verwaltung**: Eigenes Epic (PEC-216 o.ae.). Vaults werden hier nur als Container erstellt.
- **Subgraph-Integration**: Vault-Events werden initial via Frontend POST erfasst. Subgraph-basierte Indexierung ist ein separates Workpackage.
- **DeFi-Protokoll-Balances**: Aave-Positionen, PancakeSwap LP-Balances etc. Die Architektur ist erweiterbar, aber die konkreten Protocol-Adapter sind out of scope.
- **Gas Compensation / Fee Deposit Management**: Das Pre-Funding des FeeRegistry-Deposits fuer Executor-Gas-Compensation ist Teil der Automation-Verwaltung.
- **Multi-Chain Support**: Nur BSC (Chain ID 56) und BSC Testnet (Chain ID 97). Keine anderen EVM-Chains.
- **Vault-Loeschung / Deaktivierung**: Vaults koennen on-chain nicht geloescht werden. Kein "Delete Vault" Feature.
- **Vault Ownership Transfer**: `transferOwnership()` ist on-chain moeglich, wird aber im UI nicht unterstuetzt. DB-Eintraege werden bei Ownership-Wechsel nicht automatisch aktualisiert.
- **Token-Swap innerhalb des Vaults**: Kein In-Vault-Trading. Nur Deposit/Withdraw.
- **Benachrichtigungen / Alerts**: Keine Push-Notifications bei Vault-Aenderungen.
- **Mobile-optimiertes UI**: Desktop-First. Responsive Anpassungen sind nice-to-have, aber nicht MVP-kritisch.
- **Transaktionshistorie Backfill**: Keine nachtraegliche Erfassung von Events via `eth_getLogs`. Luecken (Browser geschlossen, direkte On-Chain-Interaktion) werden akzeptiert bis Subgraph aktiv ist.

## Further Notes

- **wagmi 2.x ist End-of-Life** (letztes Release Nov 2025). Migration auf wagmi 3.x sollte nach dem MVP geplant werden. Die Voraussetzungen (TypeScript >=5.9.3) sind bereits erfuellt.
- **Alchemy Free Tier** (30M CU/Monat) reicht fuer ~100 Vaults mit 5-Minuten-Polling. Bei Wachstum auf Pay-as-you-go wechseln. Die Portfolio API (`/assets/tokens/by-address`) ist CU-intensiver als einzelne JSON-RPC Calls — CU-Verbrauch beobachten.
- **BSC Decimals**: USDT und USDC verwenden auf BSC 18 Decimals (nicht 6 wie auf Ethereum). Dies muss in allen Formatierungen beruecksichtigt werden.
- **CREATE2 Salt**: Die Factory mischt `msg.sender` in den Salt -- das Frontend generiert bei **jedem TX-Submit** einen neuen Salt via `keccak256(timestamp + crypto.getRandomValues())`. Kein Salt-Reuse bei Retries.
- **USDT Approve Quirk**: Manche BSC-Tokens (USDT-Style) revertieren bei `approve(spender, newAmount)` wenn die aktuelle Allowance nicht 0 ist. Der Approve-Flow muss dies beruecksichtigen (Reset-to-Zero Pattern). Bei Infinite Approval (`type(uint256).max`) ist dies nur beim erstmaligen Approve relevant.
- **Infinite Approval**: ERC-20 Approvals werden mit `type(uint256).max` erteilt. Der Vault ist der eigene isolierte Contract des Nutzers — unbeschraenkte Genehmigung ist risikoarm und vermeidet wiederholte Approve-TXs.
- **Transaktionshistorie MVP**: Wird initial ueber Frontend-seitige `POST /vaults/:address/events` Requests bei Deposit/Withdraw befuellt (mit Retry+Backoff). Dies ist nicht lueckenlos (z.B. direkte On-Chain-Interaktionen, Automation-Ausfuehrungen). Ein Disclaimer im UI weist darauf hin. Subgraph-Integration schliesst diese Luecke spaeter.
- **Entwicklungsumgebung**: Hardhat Mainnet-Fork mit Faucet fuer Test-Tokens. Backend `AlchemyService` wechselt via `NODE_ENV=development` auf lokale RPC-Reads. Alchemy Portfolio API wird nur in Production/Staging genutzt.
- **ABI-Extraktion**: Build-Script (post-compile) extrahiert ABIs aus Hardhat-Artifacts und schreibt sie als `as const` TypeScript-Dateien in `packages/frontend/src/lib/abis/`.
- **research.md Section 10+11** enthalten detaillierte Code-Beispiele fuer alle wagmi Hooks und Backend-Service-Implementierungen.
