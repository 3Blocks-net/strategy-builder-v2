---
created: 2026-07-25
last_verified: 2026-07-25
git_commit: 7ca671beafc34c201d4980a6ef66297bec67aa7f
extrahiert: aus-bestandscode
---

# Epic: vault-contracts — On-Chain-Schicht (Reverse-Spec)

> Rekonstruktion aus Bestandscode. Belege verweisen auf Dateien unter
> `packages/contracts/`; Fork-/Unit-Tests unter `packages/contracts/test/` sind
> Verhaltens-Belege. Im Zweifel gilt der Code.

## Einseiter

Die On-Chain-Schicht (Solidity ^0.8.28, Hardhat, Ziel-Chain BSC) liefert
Self-Custody-Vaults mit automatisierten DeFi-Strategien:

- **StrategyBuilderVaultFactory** deployt pro Nutzer einen Vault als
  ERC1967-Proxy (CREATE2, Salt pro Caller) und führt ein Vault-Register.
  Die Factory ist plain `Ownable`, nicht upgradebar; der Vault implementiert
  kein UUPS — **einmal deployte Vaults sind effektiv unveränderlich**
  (`StrategyBuilderVaultFactory.sol:10-31`).
- **StrategyBuilderVault** hält Gelder (ERC-20, ETH, LP-NFTs) und führt
  Automationen aus: gerichtete Schritt-Graphen aus Conditions (staticcall,
  read-only) und Actions (delegatecall im Vault-Kontext), verdrahtet über einen
  geteilten persistenten `bytes[]`-Kontext (`StrategyBuilderVault.sol:14-40`).
- **FeeRegistry** ist Fee-Kustode und Gas-Kompensations-Kasse: flat BPS-Fees an
  der Vault-Grenze (Cap 10 %), vorfinanzierte Gas-Depots pro Vault, Auszahlung
  direkt an den Executor via Preis-Orakel (`FeeRegistry.sol:11-29`).
- **Actions** (Aave V3: Supply/Borrow/Withdraw/Repay; PancakeSwap V3:
  Swap/Mint/IncreaseLiquidity/DecreaseLiquidity/Collect/SwapToRangeRatio) sind
  stateless Contracts mit `immutable` Registry-Referenz; **Registries**
  (AaveV3Registry, PancakeSwapV3Registry) sind ownerlose, setterlose
  Adressbücher. `SwapToRangeRatio` und `WickWaitRebalanceCondition` gehören zum
  Katalog, werden hier aber nur als Einträge erwähnt (eigene Reverse-Spec
  „wick-wait-strategy").

Kern-Garantie: Gelder und Konfiguration gehören exklusiv dem Vault-Owner;
Fremde dürfen nur ausführen, was der Owner als Automation freigegeben hat, und
auch das nur, wenn der on-chain geprüfte Trigger feuert.

## Personas & Rollen

| Rolle | Beschreibung | Rechte (on-chain erzwungen) |
| --- | --- | --- |
| **Vault-Owner** | Endnutzer, `OwnableUpgradeable`-Owner seines Vault-Proxys | deposit/withdraw/withdrawETH, Automationen anlegen/ändern/(de)aktivieren, Kontext setzen, Gas-Depot verwalten; darf Automationen auch bei nicht erfülltem Trigger ausführen |
| **Keeper/Executor** | Beliebige Adresse (Bot, Keeper-Netzwerk), führt `executeAutomation` aus | Nur aktive, nicht-ownerOnly Automationen, nur bei erfülltem Trigger; erhält Gas-Kompensation aus dem Vault-Depot |
| **Factory-Deployer/-Owner** | Betreiber; `Ownable`-Owner der Factory | `setVaultImplementation` (nur künftige Vaults), `setFeeRegistry` (nur künftige Vaults) |
| **FeeRegistry-Owner** | Betreiber; `Ownable`-Owner des FeeRegistry | Token-Whitelist, Fee-BPS (≤ 10 %), Gas-Konfiguration, Abheben der gesammelten Fees (nicht der Vault-Depots) |
| **Vault-Ersteller** | Beliebige Adresse — `createVault` ist permissionless | Bestimmt `vaultOwner`, `depositToken`, `salt` |
| **Action-/Condition-Contracts** | Deployte Bausteine (stateless / view) | Actions laufen per delegatecall im Vault; Conditions per staticcall (können nichts schreiben) |

## Fachliche Regeln & Verbotsliste

Aus `require`/`revert`/Modifiern abgeleitet — das darf on-chain **niemals** passieren:

1. **Nie** darf ein Nicht-Owner Gelder ein-/auszahlen, Automationen oder Kontext
   verändern — alle Mutationen außer `executeAutomation` sind `onlyOwner`
   (`StrategyBuilderVault.sol:164-309`; Tests „reverts for non-owner").
2. **Nie** darf ein Nicht-Owner eine Automation ausführen, deren Trigger nicht
   erfüllt ist → `TriggerNotMet` (`StrategyBuilderVault.sol:345`).
3. **Nie** darf jemand außer dem Owner eine `ownerOnly`-Automation ausführen →
   `CallerNotOwner` (`StrategyBuilderVault.sol:318`).
4. **Nie** darf eine inaktive oder nicht existierende Automation laufen →
   `AutomationNotActive` / `AutomationDoesNotExist` (`StrategyBuilderVault.sol:314-317`).
5. **Nie** darf ein Schritt-Graph endlos laufen — hartes Limit `MAX_STEPS = 256`
   pro Ausführung → `MaxStepsExceeded` (Zyklen-Schutz, `StrategyBuilderVault.sol:50,331`).
6. **Nie** darf eine öffentliche Automation mit einer ACTION beginnen
   (`FirstStepMustBeCondition`), **nie** dürfen Schritte Zero-Target/Zero-Selector
   oder Out-of-Range-Verweise haben; ACTION-Schritte haben genau einen Nachfolger
   (`nextOnFalse` muss `DONE` sein) (`StrategyBuilderVault.sol:454-478`).
7. **Nie** darf ein Action-Kontext-Diff Slots außerhalb des Kontexts schreiben
   (`ContextSlotOutOfBounds`) oder ungleich lange Slot-/Wert-Arrays liefern
   (`ContextDiffLengthMismatch`) (`StrategyBuilderVault.sol:570-585`).
8. **Nie** dürfen Conditions Zustand ändern — sie werden per `staticcall`
   aufgerufen; ebenso `afterExecution` des Triggers (`StrategyBuilderVault.sol:543-556,511-541`).
9. **Nie** Withdraw/ETH-Withdraw an die Zero-Address → `ZeroRecipient`
   (`StrategyBuilderVault.sol:211,618`).
10. **Nie** eine Deposit-/Withdraw-Fee über 10 % → `FeeTooHigh`, `MAX_FEE_BPS = 1_000`
    (`FeeRegistry.sol:35,86-96`).
11. **Nie** darf der FeeRegistry-Owner Gas-Depots der Vaults abziehen — er
    entnimmt nur `collectedFees`; ein Vault kann nur sein **eigenes** Depot
    belasten (`vaultDeposits[msg.sender]`) → Invariante
    `Balance == Σ vaultDeposits + collectedFees` (`FeeRegistry.sol:26-29,117-123,160-175`).
12. **Nie** Gas-Kompensation über das vorfinanzierte Depot hinaus →
    `InsufficientFeeDeposit`; nie über `maxGasPrice` hinaus vergütet
    (`FeeRegistry.sol:168-170,242-245`).
13. **Nie** darf die Vault-Implementation direkt initialisiert werden —
    `_disableInitializers()` im Konstruktor (`StrategyBuilderVault.sol:141-143`;
    Test „vault implementation cannot be initialised directly").
14. **Nie** darf `createVault` ohne gesetzte Implementation, mit Zero-Owner oder
    mit nicht akzeptiertem Fee-Token durchgehen (`ImplementationNotSet`,
    `ZeroAddress`, `FeeTokenNotAccepted`); die Implementation muss Code haben
    (`InvalidImplementation`) (`StrategyBuilderVaultFactory.sol:78-84,108-115`).
15. **Nie** kann ein fremder Caller die CREATE2-Adresse eines anderen Callers
    besetzen — Salt wird mit `msg.sender` gehasht (`StrategyBuilderVaultFactory.sol:91`;
    Test „same salt from different callers produces different vault addresses").
16. **Nie** bleiben stehende Token-Allowances nach einer Action zurück —
    `forceApprove(x)` … `forceApprove(0)`-Hygiene in allen approvenden Actions
    (`actions/AaveV3SupplyAction.sol:76-79`, `actions/PancakeSwapV3SwapAction.sol:83-98`).
17. **Nie** ein TARGET_HF-Ziel ≤ 1.05 (Sicherheits-Floor) →
    `InvalidTargetHealthFactor` (`libraries/ActionLib.sol:83,172-174`).
18. **Nie** Reentrancy in `executeAutomation` bzw. den FeeRegistry-Geldflüssen —
    `ReentrancyGuardTransient` / `nonReentrant` (`StrategyBuilderVault.sol:44,313`,
    `FeeRegistry.sol:117-175`).

## Anforderungen

### A1 — Vault-Erstellung über die Factory

- **Rolle:** Vault-Ersteller (permissionless) / Factory-Owner (Konfiguration)
- **Fähigkeit:** `createVault(vaultOwner, depositToken, salt)` deployt einen
  ERC1967-Proxy auf die hinterlegte Implementation und initialisiert ihn atomar
  mit Owner, FeeRegistry und Gas-Token.
- **Zweck:** Jeder Nutzer bekommt deterministisch (CREATE2) einen eigenen,
  isolierten Self-Custody-Vault.
- **Fachliche Kriterien:**
  - Normalfall: Proxy wird deployt, im Register eingetragen (`isRegisteredVault`,
    `getVault`, `vaultCount`), `VaultCreated` mit Index emittiert; der Vault
    gehört `vaultOwner`, nicht dem Ersteller (Test „vault proxy is owned by
    vaultOwner, not factory deployer"). Jeder Vault hat unabhängigen Storage.
  - Randfälle: `depositToken = address(0)` → Gas-Kompensation deaktiviert;
    FeeRegistry ungesetzt → Fee-Token-Prüfung entfällt; Implementation-Wechsel
    wirkt nur auf künftige Vaults; gleicher Salt + anderer Caller ⇒ andere Adresse.
  - Fehlerfälle: `ZeroAddress` (Owner 0), `ImplementationNotSet`,
    `InvalidImplementation` (EOA als Implementation), `FeeTokenNotAccepted`.
- **Beleg:** `packages/contracts/contracts/StrategyBuilderVaultFactory.sol:73-139`,
  Tests `packages/contracts/test/StrategyBuilderVaultFactory.ts`

### A2 — Ein-/Auszahlung mit Fee an der Vault-Grenze

- **Rolle:** Vault-Owner
- **Fähigkeit:** `deposit(token, amount)` zieht Token vom Owner ein;
  `withdraw(token, amount, recipient)` zahlt aus; `withdrawETH` für native BNB;
  `onERC721Received` erlaubt LP-NFT-Verwahrung.
- **Zweck:** Kapital in den/aus dem Vault bewegen; Fees fallen nur hier an
  (flat BPS aus dem FeeRegistry zum Aufrufzeitpunkt), nicht pro Aktion.
- **Fachliche Kriterien:**
  - Normalfall: Deposit — Vault erhält `amount`, Fee (`amount × depositFeeBps/10000`)
    geht via `collectFee` ans FeeRegistry, Event `Deposited`. Withdraw —
    Empfänger erhält `amount − fee`, Fee ans FeeRegistry, Event `Withdrawn`.
  - Randfälle: FeeRegistry `address(0)` oder BPS 0 ⇒ keine Fee (Tests
    „feeBps=0 transfers full amount"); `withdrawETH` mit `amount = 0` ⇒ gesamter
    ETH-Bestand.
  - Fehlerfälle: Nicht-Owner ⇒ Ownable-Revert; `ZeroRecipient`;
    `ETHTransferFailed` bei fehlgeschlagenem ETH-Send.
- **Beleg:** `packages/contracts/contracts/StrategyBuilderVault.sol:179-226,613-639`,
  Tests `packages/contracts/test/StrategyBuilderVault.ts` („vault deposit / withdraw")

### A3 — Automationen anlegen, ändern, schalten

- **Rolle:** Vault-Owner
- **Fähigkeit:** `createAutomation` (öffentlich ausführbar) /
  `createOwnerAutomation` (nur Owner, darf mit ACTION starten),
  `updateAutomationSteps`, `setAutomationActive`.
- **Zweck:** Strategien als validierten Schritt-Graphen hinterlegen und steuern.
- **Fachliche Kriterien:**
  - Normalfall: Automation wird aktiv gespeichert, `AutomationCreated(id, stepCount)`;
    IDs fortlaufend (`automationCount`); `getAutomation` liefert
    (active, ownerOnly, steps).
  - Randfälle: `updateAutomationSteps` ersetzt Schritte in-place (kürzt/verlängert)
    ohne den geteilten Kontext anzutasten und behält das `ownerOnly`-Flag bei;
    Anlegen verändert den Kontext nicht.
  - Fehlerfälle: `NoSteps`, `FirstStepMustBeCondition` (nur public),
    `ZeroTargetAddress`, `ZeroSelector`, `InvalidStepReference`
    (Out-of-Range-Verweis oder ACTION mit `nextOnFalse ≠ DONE`),
    `AutomationDoesNotExist`.
- **Beleg:** `packages/contracts/contracts/StrategyBuilderVault.sol:230-280,437-478`,
  Tests „createAutomation", „updateAutomationSteps", „step validation security",
  „createOwnerAutomation / owner-only execution"

### A4 — Automations-Ausführung (Owner & Keeper) mit Trigger-Gate

- **Rolle:** Keeper/Executor (permissionless) und Vault-Owner
- **Fähigkeit:** `executeAutomation(id)` traversiert den Graphen ab Schritt 0:
  Conditions per staticcall entscheiden das Branching (`nextOnTrue`/`nextOnFalse`),
  Actions laufen per delegatecall im Vault-Kontext; `isTriggerMet(id)` als
  revert-freie Off-Chain-Sonde.
- **Zweck:** Fremde Bots führen Strategien aus, ohne je Verfügungsgewalt über
  die Gelder zu erhalten; der Owner kann manuell auch am Trigger vorbei ausführen.
- **Fachliche Kriterien:**
  - Normalfall: Trigger (Schritt 0) feuert ⇒ Graph läuft bis `DONE`,
    `AutomationExecuted(id, executor)`; Condition-false verzweigt auf den
    Alternativ-Pfad (Test „condition false branches to alternative action").
  - Randfälle: Owner darf bei nicht erfülltem Trigger trotzdem ausführen (der
    False-Pfad wird gelaufen); `ownerOnly`-Automationen dürfen mit ACTION starten
    und gelten als „Trigger erfüllt"; `isTriggerMet` liefert `false` statt Revert
    bei nicht existenter/inaktiver Automation oder fehlschlagender Condition;
    Reentrancy blockiert (`nonReentrant`).
  - Fehlerfälle: `AutomationDoesNotExist`, `AutomationNotActive`,
    `TriggerNotMet` (Nicht-Owner), `CallerNotOwner` (ownerOnly),
    `MaxStepsExceeded` (256), `ConditionCallFailed(stepIndex, reason)` und
    `ActionExecutionFailed(stepIndex, reason)` — beide reichen die
    Original-Revert-Bytes des inneren Calls durch (Tests
    `VaultRevertReason.ts`, PEC-219).
- **Beleg:** `packages/contracts/contracts/StrategyBuilderVault.sol:313-397,543-588`,
  Tests „executeAutomation (basic)", „isTriggerMet", `VaultRevertReason.ts`

### A5 — Geteilter persistenter Kontext als Datenbus

- **Rolle:** Vault-Owner (Initialisierung) / Actions & Conditions (Lesen/Schreiben)
- **Fähigkeit:** Ein vault-weites `bytes[]` (`setContext`, `setContextSlot`,
  `getContext`); Actions geben Slot-Diffs (`updatedSlots`/`updatedValues`)
  zurück, die sofort angewendet werden; Updatable-Trigger dürfen nach
  erfolgreicher Ausführung per `afterExecution` (staticcall) Slots fortschreiben
  (z. B. Zeitplan advancen).
- **Zweck:** Output eines Schritts (z. B. `amountOut` eines Swaps, Token-ID eines
  Mints) wird Input späterer Schritte — auch automationsübergreifend und über
  Transaktionen hinweg.
- **Fachliche Kriterien:**
  - Normalfall: Diff wird slotweise angewendet, nächster Schritt sieht den neuen
    Wert; am Ende wird der Kontext nur bei Änderung zurückgeschrieben; Werte
    persistieren (Tests „shared context").
  - Randfälle: `setContext` resized das Array; `afterExecution` ist best-effort —
    Fehlschlag, unparsebarer Rückgabewert oder Out-of-Range-Slots werden ignoriert
    statt zu reverten; nicht-updatable Trigger lassen den Kontext unverändert.
  - Fehlerfälle: `ContextSlotOutOfBounds` (Owner-Set wie Action-Diff),
    `ContextDiffLengthMismatch`; Nicht-Owner kann den Kontext nicht setzen.
- **Beleg:** `packages/contracts/contracts/StrategyBuilderVault.sol:284-309,480-541,570-585`,
  `interfaces/IUpdatableCondition.sol`, Tests „setContext / setContextSlot",
  „executeAutomation (shared context)", „IntervalCondition", „TimerCondition"

### A6 — Gas-Kompensation für fremde Executor

- **Rolle:** Keeper/Executor (Empfänger), Vault-Owner (Vorfinanzierung),
  FeeRegistry-Owner (Konfiguration)
- **Fähigkeit:** Vault misst `gasleft()`-Differenz; bei Nicht-Owner-Ausführung
  ruft er `FeeRegistry.deductGasComp`, das den Gasverbrauch (+ `gasOverhead`,
  + `executorMarkupBps`, `tx.gasprice` gedeckelt durch `maxGasPrice`) via
  Preis-Orakel in Fee-Token umrechnet und **direkt an den Executor** überweist.
  Vorfinanzierung via `depositFees` (Vault) bzw. `depositFor`; Rückholung nur
  durch den Vault selbst (`withdrawDeposit`). `FeeDepositAction` +
  `setMinFeeDeposit` erlauben automatisches Nachfüllen als Automations-Schritt.
- **Zweck:** Keeper arbeiten kostendeckend (plus Markup), ohne dass der Vault
  ihnen Token-Zugriff einräumen muss.
- **Fachliche Kriterien:**
  - Normalfall: Executor erhält Token aus dem Depot des Vaults,
    `GasCompSettled` + `GasCompDeducted`; `estimateGasComp` als Off-Chain-Schätzer.
  - Randfälle: Owner-Ausführung zahlt nie Gas-Kompensation; FeeRegistry oder
    `depositToken` `address(0)`, Orakel ungesetzt oder Preis 0 ⇒ Kompensation 0
    (kein Revert); `withdrawDeposit(amount=0)` zieht das ganze Depot;
    Orakel-Fehler werden per `try/catch` zu 0 bzw. Decimals-Fallback abgefedert.
  - Fehlerfälle: `InsufficientFeeDeposit` (Depot zu klein ⇒ Ausführung schlägt
    fehl), `TokenNotAccepted` (Vorfinanzierung in nicht gelistetem Token),
    `WithdrawExceedsDeposit`, `NothingToWithdraw`.
- **Beleg:** `packages/contracts/contracts/StrategyBuilderVault.sol:164-177,320,372-375,595-611`,
  `FeeRegistry.sol:100-175,195-258`, `examples/actions/FeeDepositAction.sol`,
  Tests „gas compensation", „FeeDepositAction"

### A7 — Fee-Kustode & Betreiber-Einnahmen

- **Rolle:** FeeRegistry-Owner
- **Fähigkeit:** Token-Whitelist (`addAcceptedToken`/`removeAcceptedToken`),
  globale `depositFeeBps`/`withdrawFeeBps`, `setGasConfig`, `withdrawFees`.
- **Zweck:** Betreiber-Einnahmen sauber getrennt von Nutzer-Gas-Depots verwahren.
- **Fachliche Kriterien:**
  - Normalfall: `collectFee` (vom Vault via transferFrom) akkumuliert
    `collectedFees[token]`; Owner entnimmt sie vollständig per `withdrawFees`.
  - Randfälle: `collectFee(0)` ist ein No-op; `removeAcceptedToken` deaktiviert
    nur (bestehende Depots bleiben abhebbar); Fee-Änderungen wirken sofort auf
    alle Vaults (Rate wird zur Laufzeit gelesen).
  - Fehlerfälle: `FeeTooHigh` (> 1 000 BPS), `NothingToWithdraw`, `ZeroAddress`;
    alle Konfigurationswege `onlyOwner`.
  - Invariante: physischer Token-Bestand == Σ `vaultDeposits` + `collectedFees`
    — Owner-Entnahme kann Gas-Depots nie berühren.
- **Beleg:** `packages/contracts/contracts/FeeRegistry.sol:26-29,73-123,153-158`,
  Tests „FeeRegistry"

### A8 — Action-Katalog: stateless DeFi-Bausteine mit einheitlichen Konventionen

- **Rolle:** Vault-Owner (Konfiguration der Steps); Actions laufen im Vault-Kontext
- **Fähigkeit:** Aave V3 Supply/Borrow/Withdraw/Repay und PancakeSwap V3
  Swap/Mint/IncreaseLiquidity/DecreaseLiquidity/Collect (+ `SwapToRangeRatio`,
  siehe wick-wait-strategy) implementieren `IAction.execute(params, ctx)` und
  geben Slot-Diffs zurück.
- **Zweck:** Wiederverwendbare, deploybare Strategie-Bausteine ohne eigenen State.
- **Fachliche Kriterien (Konventionen, über alle Actions konsistent):**
  - Betragsauflösung strikt getrennt: `FIXED` (expliziter Betrag, 0 ⇒ `ZeroAmount`),
    `FROM_SLOT` (aus Kontext-Slot, 0 ⇒ `ZeroAmount`, Out-of-Range ⇒
    `SlotOutOfBounds`), `MAX_AVAILABLE` (protokoll-spezifisches Maximum),
    `TARGET_HF` (Health-Factor-Zielmathematik; Enum-Werte sind ABI-stabil).
  - Oracle-gebundene Modi (`MAX_AVAILABLE` Borrow/Withdraw, `TARGET_HF`) dürfen
    zu 0 auflösen ⇒ **No-op statt Revert** (Strategie läuft weiter); Borrow-/
    Withdraw-MAX mit 0,5 %-Sicherheits-Haircut; `TARGET_HF`-Floor 1.05;
    Repay-MAX revert-frei gedeckelt auf `min(debt, balance)`; Withdraw liefert
    den **tatsächlich** ausgezahlten Betrag in den Output-Slot.
  - Approval-Hygiene: `forceApprove(amount)` → Protokoll-Call → `forceApprove(0)`.
  - Kein On-Chain-Slippage-Schutz bei Swaps/LP (`amountOutMinimum = 0`,
    `amount0Min = amount1Min = 0`, `deadline = block.timestamp`) — bewusstes,
    dokumentiertes MVP-Risiko; Forward-Compat-Felder (`amountOutMinimum`,
    `minOutFromSlot`) existieren bereits.
  - LP-Spezifika: Mint schreibt die Position-Token-ID in einen Pflicht-Slot;
    Increase/Decrease/Collect lesen die Token-ID aus einem Pflicht-Slot
    (`TokenIdSlotRequired`); Decrease bündelt `decreaseLiquidity` + `collect(max)`
    in einem Schritt (häufigster LP-Integrationsbug); Decrease-Prozent 1–100
    (`InvalidPercent`); Mint validiert `ZeroToken`/`SameToken`/`InvalidTicks`/
    `PoolNotFound`; Borrow/Repay hart auf Variable-Rate (2) fixiert.
  - Stateless-Regel: keine State-Variablen in Actions; `registry` ist `immutable`
    (Bytecode, delegatecall-sicher).
- **Beleg:** `packages/contracts/contracts/actions/*.sol`,
  `libraries/ActionLib.sol`, `interfaces/IAction.sol`; Fork-Tests
  `packages/contracts/test/*.fork.ts` (u. a. `AaveHfModes.fork.ts`)

### A9 — Condition-Katalog & Registries

- **Rolle:** Vault-Owner (Trigger-Konfiguration); Keeper (Sondierung via `isTriggerMet`)
- **Fähigkeit:** Conditions implementieren `ICondition.check(params, ctx) → bool`
  (view); optional `IUpdatableCondition.afterExecution` für selbst-fortschreibende
  Trigger. Katalog: `IntervalCondition` (wiederkehrend, drift-frei — Zeitplan
  advanced relativ zum Plan, nicht zu `now`), `TimerCondition` (one-shot, resettet
  den Slot nach dem Feuern auf 0), `TokenBalanceCondition` (Schwellwert ≥/<,
  statisch oder aus Slot), `WickWaitRebalanceCondition` (nur Katalog-Eintrag,
  eigene Spec). Protokoll-Registries: `AaveV3Registry` cached den Aave-Pool
  `immutable`, löst das Preis-Orakel aber **bei jedem Call live** über den
  `PoolAddressesProvider` auf; `PancakeSwapV3Registry` hält Router/NPM/Factory
  `immutable`. Beide ownerlos und setterlos.
- **Zweck:** Trigger deklarativ und nebenwirkungsfrei; Protokoll-Adressen
  manipulationssicher (Re-Targeting = Neu-Deploy).
- **Fachliche Kriterien:**
  - Normalfall: Interval feuert ab `nextTime` und advanced um `interval`;
    Timer feuert genau einmal pro manuellem Start; Balance-Condition vergleicht
    live `balanceOf`.
  - Randfälle: leerer/0-Slot ⇒ `false` (nicht initialisiert = nicht feuern);
    Condition-Rückgabe < 32 Bytes ⇒ `ConditionCallFailed` im Vault.
  - Fehlerfälle: `ZeroInterval`/`ZeroDelta`, `SlotOutOfBounds`;
    Registry-Konstruktoren reverten bei `ZeroAddress`.
- **Beleg:** `packages/contracts/contracts/examples/conditions/*.sol`,
  `registries/AaveV3Registry.sol`, `registries/PancakeSwapV3Registry.sol`,
  Tests „IntervalCondition", „TimerCondition", `AaveV3Registry.ts`,
  `PancakeSwapV3Registry.ts`

## Out of Scope

- **WickWaitRebalanceCondition / SwapToRangeRatioAction im Detail** — eigener
  Reverse-Spec-Agent „wick-wait-strategy"; hier nur als Katalog-Einträge geführt.
- Off-Chain-Schichten: Backend-Katalog/Seed, Frontend-Graph-Editor, MCP-Server,
  Encode-Boundary (`mapGraphToRaw` in `shared`).
- Keeper-/Executor-Infrastruktur (wer `executeAutomation` wann aufruft) — on-chain
  bewusst permissionless.
- Deploy-/Ignition-Tooling und Fork-Setup (`deploy-fork.ts`) — Betriebs-, nicht
  Contract-Verhalten.
- Test-Harnesses und Mocks unter `contracts/test/` (MockAaveV3, MockPancakeV3, …).

## Annahmen & offene Fragen

1. **Keine Action-/Condition-Whitelist im Vault:** Der Owner kann beliebige
   Adressen als delegatecall-Target eintragen. Rekonstruierte Absicht:
   Self-Custody — der Owner kann nur sich selbst schaden. Eine bösartige Action
   könnte aber den gesamten Vault-Storage (inkl. Owner-Slot) überschreiben.
   Bewusste Design-Entscheidung oder offene Härtungs-Lücke?
2. **Stateless-Regel nur Konvention:** „Actions MUST NOT declare state variables"
   (`IAction.sol:23-24`) wird on-chain nicht erzwungen — Schutz hängt an Review
   und Katalog-Kuratierung (Backend-Seed validiert gegen den deployten Katalog).
3. **Fehlender Slippage-Schutz** ist im Code als bewusstes MVP-Risiko dokumentiert
   (`PancakeSwapV3SwapAction.sol:17-24`). Annahme: Aktivierung der
   Forward-Compat-Felder ist geplant, aber nicht terminiert.
4. **`deductGasComp` ist permissionless**, belastet aber ausschließlich das Depot
   des Aufrufers (`vaultDeposits[msg.sender]`) — Fremdschädigung ausgeschlossen;
   ein Nicht-Vault-Caller könnte höchstens sein eigenes Depot an einen beliebigen
   `executor` auszahlen. Als unkritisch eingestuft (Annahme).
5. **Fee-Raten sind global und zur Laufzeit gelesen:** Der FeeRegistry-Owner kann
   BPS jederzeit (bis 10 %) ändern und trifft damit sofort alle Vaults. Kein
   Timelock, kein Per-Vault-Opt-out — akzeptiertes Betreiber-Vertrauen?
6. **Vaults sind nicht upgradebar** (kein UUPS): Bugfixes erreichen nur neue
   Vaults via `setVaultImplementation`. Annahme: bewusster Trust-Trade-off
   (Betreiber kann deployte Vaults nicht verändern) gegen fehlende Patchbarkeit.
7. **`updateAutomationSteps` validiert gegen das gespeicherte `ownerOnly`-Flag**,
   das Flag selbst ist nach Anlage unveränderlich — Annahme: gewollt.
8. **ETH-Deposits** sind fee-frei (nur `receive()`), ERC-20-Deposits nicht.
   Asymmetrie vermutlich pragmatisch (BNB primär für Gas), nicht dokumentiert.
9. **`MAX_STEPS = 256`** ist die einzige Zyklen-Abwehr — Zyklen sind beim Anlegen
   erlaubt und werden erst zur Laufzeit abgebrochen. Annahme: bewusst, um
   Schleifen-Konstrukte (bounded loops) zu ermöglichen.
