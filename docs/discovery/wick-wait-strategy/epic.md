---
created: 2026-07-25
last_verified: 2026-07-25
git_commit: 7ca671beafc34c201d4980a6ef66297bec67aa7f
extrahiert: aus-bestandscode
---

# Epic: Wick-and-Wait-Strategie (Reverse-Spec aus Bestandscode)

## Einseiter

**Wick-and-Wait** ist eine Concentrated-Liquidity-Strategie für PancakeSwap V3 (BSC), gebaut aus
zwei neuen On-Chain-Bausteinen plus drei Katalog-Recipes:

- Die **Condition `WickWaitRebalanceCondition`** feuert nur, wenn der TWAP-Tick über ein
  konfigurierbares Fenster `W` die Range der offenen Position verlassen hat **und** der
  Rebalance-Cooldown abgelaufen ist. Kurze Wicks (Spike + Rückkehr innerhalb `W`) bewegen den
  Mittelwert kaum → die Position bleibt stehen und verdient weiter Fees.
- Die **Action `PancakeSwapV3SwapToRangeRatioAction`** sized die Position **zur Ausführungszeit**:
  Sie liest den Live-Preis, rekonstruiert exakt die Range, die das folgende
  `Mint(rangeMode 1, tickDelta)` öffnen wird, berechnet das Ziel-Wertverhältnis token0/token1 für
  diese Range und swappt den überrepräsentierten Token dorthin. `Mint(full balance)` providet
  anschließend alles; ein kleiner Dust-Rest bleibt in der Vault.
- **Recipes** verdrahten das zu drei Automationen: *Entry* (Size → Mint), *Rebalance*
  (WickWait → Collect → Decrease 100% → Size → Mint), *Auto-Compound*
  (Interval → Collect → Fee Deposit → Increase).
- Der **Fork-Price-Driver** macht das Zeitverhalten lokal beobachtbar (Modus `persistent`
  vs. `wick` auf dem BTCB/USDT-Fork-Pool).

Alles ist **staticcall-/delegatecall-sicher** (keine State-Variablen außer `immutable registry`);
der Cooldown-Zustand lebt in einem Vault-Context-Slot, den `afterExecution` per Slot-Diff
fortschreibt.

> **Ehrlichkeit:** Reverse-Spec. Quelle der Wahrheit ist der Code am o. g. Commit; die
> Legacy-Specs (`docs/legacy-specs/twap-range-condition/spec.md`,
> `docs/legacy-specs/wick-wait-recipes/spec.md`) wurden gegengelesen und stimmen mit dem Code
> überein — sie bleiben aber eingefrorene Referenz, nicht lebende Spec.

## Personas & Rollen

| Rolle | Beschreibung | Berührungspunkt |
| --- | --- | --- |
| **Vault-Besitzer** | Self-Custody-Nutzer, dessen Vault die Strategie ausführt | Parametriert `W`, Cooldown, Range-Breite über Presets; trägt Swap-Kosten/Dust |
| **Strategie-Bauer** (Frontend-/MCP-Nutzer) | Baut die Automationen aus Katalog-StepTypes | Recipes + schema-getriebene `paramSchema`-Felder (`x-ui-widget`, Context-Slots) |
| **Keeper/Automation-Executor** | Ruft `check()` (staticcall) und führt bei `true` die Action-Kette aus; Vault ruft danach `afterExecution` | Bestimmt den realen Ausführungszeitpunkt → Grund für On-Chain-Sizing |
| **Entwickler** | Testet/verifiziert das Zeitverhalten lokal | `wick-wait-price-driver.ts`, Hardhat-Tests, `deploy-fork.ts` |

## Fachliche Regeln & Verbotsliste (was der Code erzwingt)

Erzwungene Regeln (Reverts/harte Logik):

1. **`twapWindow` = 0 ist verboten** → Revert `ZeroWindow()`
   (`packages/contracts/contracts/examples/conditions/WickWaitRebalanceCondition.sol:68`).
2. **Kein stiller Never-Fire bei fehlender Oracle-Historie:** Reicht die Observation-Cardinality
   des Pools nicht für `W`, wird der `observe`-Revert **propagiert** statt `false`
   zurückzugeben — eine fehlkonfigurierte Strategie fällt sichtbar aus
   (Kommentar + Verhalten `WickWaitRebalanceCondition.sol:92–95`, Test
   `packages/contracts/test/WickWaitRebalanceCondition.ts:107`).
3. **Pool = Single Source of Truth aus der Position:** Der Pool wird aus
   `token0/token1/fee` der Position abgeleitet, nie separat übergeben; existiert er nicht →
   `PoolNotFound()` (`WickWaitRebalanceCondition.sol:89–90`).
4. **Slot-Grenzen:** Zugriff auf einen Context-Slot ≥ `ctx.length` → `SlotOutOfBounds(slot)`
   (`WickWaitRebalanceCondition.sol:117,145`).
5. **Cooldown-Fortschreibung nur bei tatsächlichem Feuern:** `afterExecution` wird von der Vault
   nur nach einem Trigger aufgerufen und schreibt `block.timestamp` in den
   `lastRebalanceSlot` — genau ein Fortschritt pro Rebalance
   (`WickWaitRebalanceCondition.sol:112–124`).
6. **Kein Overflow-Brick beim Cooldown:** `last + cooldown` ist saturierend — ein pathologischer
   Cooldown (~`uint256.max`) kann `check()` nicht dauerhaft zum Overflow-Revert bringen
   (`WickWaitRebalanceCondition.sol:104–106`).
7. **Sizing-Action-Eingaben:** Null-Adresse → `ZeroToken()`, identische Token → `SameToken()`,
   nicht existenter Pool → `PoolNotFound()`
   (`packages/contracts/contracts/actions/PancakeSwapV3SwapToRangeRatioAction.sol:68–76`).
8. **Extreme Preise abgewiesen statt falsch gerechnet:** `sqrtRatio(tickUpper) > uint128.max`
   → `SqrtPriceTooHigh()` (Overflow-Schutz der Ratio-Formel;
   `PancakeSwapV3SwapToRangeRatioAction.sol:98`).
9. **Range-Identität mit Mint:** Die Action rundet `tick ± tickDelta` auf das Tick-Spacing
   (down/up) und wendet denselben Degenerate-Range-Guard an wie die Mint-Action
   (`tickLower == tickUpper` → `tickUpper += spacing`), damit sie für **exakt** die Range sized,
   die Mint öffnen wird (`PancakeSwapV3SwapToRangeRatioAction.sol:80–84`).
10. **Zustandsfreiheit:** Beide Contracts halten keine State-Variablen (nur `immutable
    registry`); die Condition ist vollständig `view` (staticcall-sicher), die Action läuft per
    delegatecall im Vault-Kontext (`WickWaitRebalanceCondition.sol:22–23`,
    `PancakeSwapV3SwapToRangeRatioAction.sol:28–29`).
11. **Router-Allowance wird nach dem Swap auf 0 zurückgesetzt**
    (`PancakeSwapV3SwapToRangeRatioAction.sol:138–151`).
12. **Registry ≠ 0 bei Deployment** (`require(registry_ != address(0))`, beide Contracts).

Bewusst NICHT erzwungen (dokumentierte v1-Lücken, keine Bugs):

- **Kein Slippage-Schutz:** `amountOutMinimum` ist per Design `0` in v1 (konsistent mit
  `SwapAction`; Sandwich-Schutz ist getrackter Follow-up) — im Schema sogar `x-ui-hidden`
  (`PancakeSwapV3SwapToRangeRatioAction.sol:27–28`,
  `packages/backend/prisma/seed/catalog/pancakeswap.ts:387–393`).
- **Single-Pass-Sizing:** Die Ziel-Ratio ignoriert den Preisimpact des eigenen Swaps; der
  Restbestand ist akzeptierter Dust (`PancakeSwapV3SwapToRangeRatioAction.sol:26–27`).
- **`tickDelta`-Gleichheit zwischen Size und Mint wird nicht cross-validiert** — nur per
  Schema-Beschreibung („MUST match the following Mint") und Recipe-Konvention (gleiches
  `RANGE`-Placeholder) abgesichert (`pancakeswap.ts:379–386`, `recipe-seed-data.ts:160,167`).

## Anforderungen

### A1 — TWAP-bestätigter Range-Bruch-Trigger

- **Rolle:** Keeper/Vault (Aufrufer von `check()`)
- **Fähigkeit:** Erkennen, dass der Durchschnittspreis die Position-Range **nachhaltig** verlassen hat
- **Zweck:** Nur bei persistenten Moves rebalancen, nicht bei Wicks
- **Fachliche Kriterien:**
  - *Normalfall:* `check(params, ctx)` liest die Token-Id aus `ctx[tokenIdSlot]`, holt
    `tickLower/tickUpper` + Pool aus der Position und berechnet den TWAP-Tick über `W` via
    `observe([W, 0])` als `(cum[1]−cum[0])/W`, bei negativem Rest Richtung −∞ gerundet
    (Uniswap-`OracleLibrary.consult`-kompatibel). Breach ⇔ `twapTick < tickLower ||
    twapTick >= tickUpper`. Ohne Breach → `false`.
  - *Randfall Wick:* Spot-Tick außerhalb, TWAP innerhalb → `false` (Test
    `test/WickWaitRebalanceCondition.ts:82`).
  - *Randfall Grenzwert:* TWAP exakt auf `tickUpper` zählt als Breach (half-open range
    `[tickLower, tickUpper)`; Test `:76`).
  - *Fehlerfall:* `twapWindow == 0` → Revert `ZeroWindow`; Oracle-Historie < `W` →
    `observe`-Revert wird propagiert (kein stilles `false`); Pool nicht gefunden →
    `PoolNotFound`.
- **Beleg:** `packages/contracts/contracts/examples/conditions/WickWaitRebalanceCondition.sol:63–107,126–138`;
  Tests `packages/contracts/test/WickWaitRebalanceCondition.ts:64–119`

### A2 — Cooldown zwischen Rebalances

- **Rolle:** Vault-Besitzer (Schutz vor Über-Rebalancing), Vault (Zustandsführung)
- **Fähigkeit:** Nach einem Rebalance mindestens `cooldown` Sekunden Ruhe erzwingen
- **Zweck:** Kleine Positionen nicht durch häufige Rebalances (Gas + Swap-Fees) aufzehren
- **Fachliche Kriterien:**
  - *Normalfall:* Bei Breach gilt `met ⇔ block.timestamp ≥ last + cooldown` (saturierend), wobei
    `last` aus `ctx[lastRebalanceSlot]` gelesen wird.
  - *Randfall Erstlauf:* Unbeschriebener/kurzer Slot (< 32 Bytes) liest als `0` → nie rebalanced
    → nicht geblockt (Test `:101`).
  - *Randfall Fortschreibung:* `afterExecution` liefert einen Slot-Diff
    `{lastRebalanceSlot → abi.encode(block.timestamp)}`; die Vault ruft es nur nach einem
    Feuern auf → Cooldown startet genau einmal pro Rebalance (Test `:121`).
  - *Fehlerfall:* `lastRebalanceSlot ≥ ctx.length` → `SlotOutOfBounds`; Overflow von
    `last + cooldown` ist per Saturierung ausgeschlossen.
- **Beleg:** `WickWaitRebalanceCondition.sol:101–124,140–149`;
  Tests `test/WickWaitRebalanceCondition.ts:89–106,121`

### A3 — On-Chain-Sizing auf die Range-Ratio (SwapToRangeRatio)

- **Rolle:** Vault (delegatecall-Ausführung), Vault-Besitzer (Ergebnis: korrekt sized Position)
- **Fähigkeit:** Zur Ausführungszeit die Vault-Bestände (token0/token1) auf das Wertverhältnis
  swappen, das die Range `tick ± tickDelta` (auf Spacing gerundet) verlangt
- **Zweck:** Keeper-Zeitpunkt ist unbekannt → Build-Time-Beträge wären stale; funktioniert
  identisch für Entry (nur Deposit-Token) und Rebalance (beide Token nach Decrease)
- **Fachliche Kriterien:**
  - *Normalfall:* Ziel-Anteil `r0 = A/(A+B)` mit `A = sp·(sb−sp)/sb`, `B = sp−sa`
    (sqrt-Preise der Range-Grenzen, `sp` auf `[sa, sb]` geklemmt). Vault-Wert in token1-Einheiten
    `V = bal0·(sp/Q96)² + bal1`; Überschuss der überrepräsentierten Seite wird per
    `exactInputSingle` über den Registry-Router getauscht (amountIn auf die vorhandene Balance
    gekappt). Rückgabe: leerer Slot-Diff. Tests belegen ~50/50 aus reinem token0, reinem token1
    und aus unausgewogenem Zwei-Token-Bestand.
  - *Randfall bereits balanciert:* `value0 == targetValue0` → No-op, kein Swap (Test
    `test/PancakeSwapV3SwapToRangeRatioAction.ts:88`); `amountIn == 0` → Swap wird übersprungen.
  - *Randfall Preis außerhalb der Range:* `sp` wird auf `[sa, sb]` geklemmt → Ziel wird 100/0
    bzw. 0/100 (einseitige Position); `denom == 0` → No-op statt Division durch 0.
  - *Randfall degenerierte Range:* `tickLower == tickUpper` nach Rundung → `tickUpper += spacing`
    (identisch zur Mint-Action).
  - *Fehlerfall:* `ZeroToken`, `SameToken`, `PoolNotFound`, `SqrtPriceTooHigh` (s. Verbotsliste);
    kein `minOut` in v1 (bewusst).
- **Beleg:** `packages/contracts/contracts/actions/PancakeSwapV3SwapToRangeRatioAction.sol:63–175`;
  Tests `packages/contracts/test/PancakeSwapV3SwapToRangeRatioAction.ts:60–99`

### A4 — Katalog-StepTypes (schema-getrieben)

- **Rolle:** Strategie-Bauer (Frontend/MCP), Backend-Seed
- **Fähigkeit:** Beide Bausteine als StepTypes mit `abiFragment` + `paramSchema` + `x-ui`-Rollen
  konsumieren — ohne per-step-type-Code
- **Zweck:** Encode-Boundary (`mapGraphToRaw` in `shared`) und UI/Assistent arbeiten rein
  schema-getrieben
- **Fachliche Kriterien:**
  - *Normalfall Condition:* StepType „Wick & Wait Rebalance" (Kategorie CONDITION,
    `contractKey: WickWaitRebalanceCondition`, `check`- und `afterExecution`-Selector).
    Params: `tokenIdSlot` (context-slot, read), `twapWindow` (duration, Default 30 min),
    `cooldown` (duration, Default 3 Tage), `lastRebalanceSlot` (context-slot, read-write).
    Preset-Guidance in der Beschreibung: Conservative 1h / Balanced 30m / Aggressive 10m.
  - *Normalfall Action:* StepType „PancakeSwap V3 Swap to Range Ratio" (Kategorie ACTION,
    kein `afterExecutionSelector`). Params: `tokenA`/`tokenB` (token-selector), `fee`
    (fee-tier, Default 500), `tickDelta` (range-percent, Default 1000 ≈ ±10 %, „MUST match the
    following Mint"), `amountOutMinimum` (hidden, Default „0").
  - *Randfall Seed-Hygiene:* Recipes/StepTypes werden beim Seed gegen den deployten Katalog
    validiert (ungültige übersprungen); Seed ist self-pruning; `deploy-fork.ts` deployt beide
    Contracts mit.
  - *Fehlerfall:* Referenziert ein Recipe unbekannte StepTypes/Param-Keys, wird es beim Seed
    verworfen (Seed-Validierung).
- **Beleg:** `packages/backend/prisma/seed/catalog/core.ts:284–339` (Condition),
  `packages/backend/prisma/seed/catalog/pancakeswap.ts:337–397` (Action),
  `packages/contracts/scripts/deploy-fork.ts`, `packages/backend/prisma/seed.ts`

### A5 — Drei Wick-and-Wait-Recipes

- **Rolle:** Strategie-Bauer
- **Fähigkeit:** Die komplette Strategie als drei vorgefertigte Graph-Shapes instanziieren
- **Zweck:** Korrekte Verdrahtung (Reihenfolge, Slot-Wiederverwendung, gleiches RANGE) ohne
  Handarbeit
- **Fachliche Kriterien:**
  - *Normalfall Entry* (`wick-wait-entry`): `SwapToRangeRatio → Mint(rangeMode 1, full balance)`;
    Position-Id landet im `LP_POSITION_SLOT`; einmalig/manuell ausführen.
  - *Normalfall Rebalance* (`wick-wait-rebalance`): `WickWait-Trigger → Collect →
    Decrease(100 %) → SwapToRangeRatio → Mint`; der führende Collect erntet die Fees, **bevor**
    das Prinzipal entnommen wird (Decrease bündelt intern ein eigenes Collect); neuer `tokenId`
    überschreibt denselben Slot; Beschreibung verlangt gleiches RANGE wie der Entry; Dust-Rest
    ist akzeptiert.
  - *Normalfall Auto-Compound* (`wick-wait-compound`): `Interval → Collect → Fee Deposit →
    Increase`; die Fee-Deposit-Stufe füllt die Gas-Reserve auf die Zielreserve auf
    (Zero-Toggle „Bis Zielreserve auffüllen", Default an) — hält die Vault für den Keeper
    zahlungsfähig ohne separate Wartungs-Automation.
  - *Randfall:* Alle drei Shapes nutzen Platzhalter-Params (`TOKEN_A`, `RANGE`, `TWAP_WINDOW`,
    `COOLDOWN`, `LP_POSITION_SLOT`, `LAST_REBALANCE_SLOT`) — kein Wert ist hart einkodiert.
  - *Fehlerfall:* Seed-Validierung verwirft Recipes mit unbekannten StepTypes/Param-Keys (A4).
- **Beleg:** `packages/backend/src/recipe/recipe-seed-data.ts:105–214`

### A6 — Fork-Price-Driver (Dev-Tooling)

- **Rolle:** Entwickler
- **Fähigkeit:** Auf dem lokalen BSC-Fork (nur BTCB/USDT) den Pool-Preis gezielt aus der Range
  einer offenen Position treiben und pro Schritt Spot-Tick, TWAP-Tick, in/out-of-range und
  „would-fire" loggen
- **Zweck:** Das TWAP+Cooldown-Verhalten der Condition manuell beobachtbar machen, bevor/neben
  der echten Automation
- **Fachliche Kriterien:**
  - *Normalfall `persistent`:* Preis raus (echte Router-Swaps als impersonierter Whale, per
    `sqrtPriceLimitX96` am Ziel-Tick gekappt), dann > `W` halten (Keep-alive-Swaps schreiben
    Observations) → Erwartung „would-fire = YES".
  - *Normalfall `wick`:* Preis raus, innerhalb `W` zur Range-Mitte zurückschnappen, dann halten →
    Erwartung „would-fire = no".
  - *Randfall Oracle kalt:* Reicht die Cardinality nicht für `W`, wärmt das Skript sie selbst auf
    (`increaseObservationCardinalityNext` + Warm-Swaps + Zeitsprung > `W`).
  - *Randfall:* „would-fire" modelliert **nur** den TWAP-Breach; der Cooldown ist Automation-State
    und wird explizit nur notiert, nicht simuliert.
  - *Fehlerfall:* Fehlendes `POSITION_ID` → Abbruch mit Meldung; Position, die kein
    BTCB/USDT-Pool ist → Abbruch; Whale ohne tokenIn → Warnung + Abbruch der Push-Schleife;
    gescheiterte Limit-Swaps werden ignoriert (Block wird trotzdem gemined).
- **Beleg:** `packages/contracts/scripts/wick-wait-price-driver.ts`

## Out of Scope

- **Slippage-/Sandwich-Schutz** beim Sizing-Swap (`amountOutMinimum` fest 0, Feld nur
  forward-compat; getrackter Follow-up).
- **Multi-Pass-/impact-korrigiertes Sizing** — Single-Pass per Design, Rest ist Dust.
- **Extreme-Preis-Pools** (`sqrt`-Preise > `uint128.max`) — bewusster Revert statt
  `FullMath.mulDiv` (Follow-up laut Code-Kommentar).
- **Andere DEXe/Chains** als PancakeSwap V3 auf BSC; der Price-Driver ist zusätzlich auf
  BTCB/USDT festgenagelt.
- **Cross-Validierung `tickDelta` zwischen Size- und Mint-Step** (nur Konvention/Schema-Text).
- **Keeper-/Scheduling-Infrastruktur** selbst — die Condition ist nur der staticcall-Check.
- **Off-chain-Sizing als Ausführungspfad** — `lp-math`-Preview höchstens fürs Frontend
  (Legacy-Spec), nie als ausgeführter Betrag.

## Annahmen & offene Fragen

**Annahmen (aus Code plausibel, nicht direkt belegt):**

- A-1: Die Vault-Engine ruft `afterExecution` verlässlich **nur** nach einem tatsächlich
  gefeuerten Trigger auf (der Contract verlässt sich darauf; Kommentar
  `WickWaitRebalanceCondition.sol:110–111`). Die Engine-Seite wurde hier nicht auditiert.
- A-2: `tickDelta` ist in Ticks (range-percent-Widget mit Default 1000); die Umrechnung
  Prozent↔Ticks liegt in der UI/Encode-Boundary, nicht im Contract.
- A-3: Die Presets (Conservative/Balanced/Aggressive, 7d/3d/1d) leben nur als Schema-Defaults
  und Beschreibungstexte — es gibt keinen Preset-Mechanismus im Backend.

**Offene Fragen:**

- F-1: Wie/ob die Range-Gleichheit zwischen `SwapToRangeRatio.tickDelta` und `Mint.tickDelta`
  irgendwann validiert werden soll (Builder-Lint? Seed-Check?) — heute reine Konvention.
- F-2: Zeitplan/Design des Slippage-Schutzes (v2) — betrifft sowohl `SwapToRangeRatio` als auch
  `SwapAction`.
- F-3: Verhalten bei geschlossener/übertragener Position: `npm.positions(tokenId)` mit einem
  verbrannten Token revertet vermutlich — gewollt (sichtbarer Ausfall) oder soll die Condition
  dann sauber `false` liefern? Im Code nicht behandelt, in Tests nicht abgedeckt.
- F-4: Ob der Cooldown-Default (3 Tage) und das TWAP-Fenster-Default (30 min) je gegen reale
  Fee-/Gas-Daten kalibriert wurden — keine Evidenz im Repo.
