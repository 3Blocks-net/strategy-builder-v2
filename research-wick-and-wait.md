# Research & Gap-Analyse: Wick-&-Wait Concentrated-Liquidity-Strategie

> **Expiry:** Nach Abschluss des `feat/wick-and-wait`-Features löschen (Arbeitsdokument, nicht für main).
> **Docs source:** Codebase-Exploration + Context7 `/uniswap/docs` (V3-Oracle; PancakeSwap V3 = Uniswap-V3-Fork) + Repo-Contracts.
> **Branch:** `feat/wick-and-wait`

## Was ist die Strategie (kurz)

Concentrated-Liquidity-Range-Management auf PancakeSwap V3: Deposit (1 Asset) → in Token A/B
splitten → LP-Position um den aktuellen Preis öffnen → Fees verdienen. Verlässt der Preis die
Range, **nicht sofort** rebalancen: erst **warten**. Ist es nur ein kurzer **Wick** und der Preis
kehrt zurück → Position bleibt. Bleibt der Preis **lang genug draußen** → alte Position schließen,
50:50 rebalancen, neue Position um den neuen Preis öffnen.

### Festgelegte Anforderungen (User, 2026-06-12)
- **Deposit-Token ist die Basis.** Eine LP-Seite *ist* der Deposit-Token; die andere Seite entsteht,
  indem vor dem Providen ein **Teil des Deposit-Tokens in den anderen Pool-Token geswappt** wird,
  dann LP. Kein dritter Asset. (Beantwortet das Sizing als **single-sided**: „wie viel % des
  Deposit-Tokens in den anderen Token swappen, damit die Range balanciert ist".)
- **Auto-Compound ist Pflicht** (nicht optional). → braucht **kein neues Contract** (Collect+Increase
  existieren), nur eine eigene Interval-Automation: Fees einsammeln → in die Position nachlegen.
- **Alle weiteren Parameter setzt der User** (Pool/Fee-Tier, Wartezeit W, Range-Breite, Compound-
  Intervall, Slippage…) → schema-getrieben über `paramSchema`, keine Hardcodes.

---

## 1. Was EXISTIERT bereits (wiederverwendbar)

Die **Actions** sind fast vollständig vorhanden — die Strategie ist primär eine **Condition**-Lücke.

| Baustein | Datei | Deckt ab |
|---|---|---|
| **Swap** (V3) | `PancakeSwapV3SwapAction.sol` | initialer Split + Rebalance-Swaps (amount FIXED/FROM_SLOT/full balance, out→slot) |
| **Mint** (Position öffnen) | `PancakeSwapV3MintAction.sol` | **rangeMode 1 liest `pool.slot0().tick` und zentriert tickLower/Upper = tick ∓ tickDelta** → Auto-Range um aktuellen Preis; schreibt `tokenId` in einen Pflicht-Out-Slot |
| **Decrease** (Liquidität −%) | `PancakeSwapV3DecreaseLiquidityAction.sol` | Position schließen via `percent=100` (liest `tokenId` aus Slot, liest `positions().liquidity`) |
| **Collect** (Fees/Tokens) | `PancakeSwapV3CollectAction.sol` | Tokens nach dem Decrease einsammeln |
| **Increase** | `PancakeSwapV3IncreaseLiquidityAction.sol` | Auto-Compound / Nachlegen |
| **Context-Slots** | Vault | `tokenId` persistiert über Runs: Mint→(Condition/Decrease/Collect); neuer Mint überschreibt den Slot |
| **IntervalCondition** | `examples/conditions/IntervalCondition.sol` | „regelmäßig prüfen" |
| **IUpdatableCondition** | `interfaces/IUpdatableCondition.sol` | zustandsbehaftete Conditions (**aber:** `afterExecution` schreibt Context **nur wenn der Trigger gefeuert hat**) |
| **Cockpit-Bewertung** | `cockpit/pancakeswap/lp-position.ts`, `lp-math.ts` | LP-Position bereits USD-bewertet, in-range/Amounts; `getSqrtRatioAtTick`, `getAmountsForLiquidity` |
| **Read-Interfaces** | `IPancakeV3Pool.slot0()`, `INonfungiblePositionManager.positions()` | `slot0().tick` (aktueller Tick) + `positions(tokenId).tickLower/tickUpper/liquidity` → **In-Range-Check ohne neuen Read möglich** |

## 2. Was FEHLT (zu bauen)

### 2.1 In-Range-/Out-of-Range-Condition (neu, klein) — mit BESTEHENDEN Interfaces baubar
Neue `ICondition` (view): liest `pool.slot0().tick` und `npm.positions(tokenId).tickLower/tickUpper`
(tokenId aus Context-Slot) → `met = tick < tickLower || tick >= tickUpper`. Kein neuer externer Read nötig.
Liefert den „Preis hat die Range verlassen?"-Baustein.

### 2.2 Der Wick-Filter / das „Warten" — **Kernstück & eigentliche Lücke**
**Architektur-Constraint:** `IUpdatableCondition.afterExecution` läuft **nur nach erfolgreichem Feuern**.
Den Zeitpunkt „Preis hat die Range zuerst verlassen" kann eine Condition also **nicht** persistieren,
ohne zu feuern (denn beim Verlassen soll sie ja *nicht* rebalancen, sondern warten). Eine rein
zustandsbasierte Dwell-Logik passt damit **nicht** sauber ins Modell.

**Empfohlene Lösung — TWAP-Fenster-Condition (stateless, wick-robust by design):**
Pool-`observe([W, 0])` liefert `tickCumulatives`; Mittel-Tick über das Fenster W =
`(tickCumulatives[1] − tickCumulatives[0]) / W`. **Met = Mittel-Tick außerhalb [tickLower, tickUpper].**
Ein kurzer Wick (≪ W) zieht den TWAP kaum aus der Range → kein Rebalance. Ein anhaltender Move zieht
den TWAP raus → Rebalance. Das Strategie-Konzept „bleibt lang genug draußen" == **TWAP-Fenster W**.
- **Benötigt:** `observe(uint32[])` zum `IPancakeV3Pool`-Interface ergänzen (heute nur `slot0`/`tickSpacing`/`token0/1`).
- **Gotcha (wichtig):** Pools starten mit `observationCardinality = 1` → `observe(W>0)` **revertet ("OLD")**.
  `slot0()` liefert die Cardinality bereits mit; ggf. einmalig `pool.increaseObservationCardinalityNext(N)`
  aufrufen und „aufwärmen" (N Observations füllen sich, ~1 pro Block mit Swap), bevor W nutzbar ist.

### 2.3 Rebalance-Trigger-Condition
Kombiniert 2.2: „TWAP-Tick liegt außerhalb der Range der offenen Position". Das ist der eine Trigger
(Step 0) der Rebalance-Automation.

### 2.4 Die Automation-Graphen (alle vom Deposit-Token ausgehend)
- **Entry** (einmalig/manuell): Swap (**Teil des Deposit-Tokens → anderer Token**) → Mint (rangeMode 1)
  → `tokenId` persistiert. Der gemintete LP besteht aus Deposit-Token + geswapptem anderen Token.
- **Rebalance** (Interval-Monitor): Trigger = RebalanceTrigger(TWAP out of range) → Decrease(100%) →
  Collect → **auf Deposit-Token normalisieren** (anderen Token → Deposit-Token swappen) → Swap
  (Teil Deposit-Token → anderer Token, für die neue Range) → Mint (rangeMode 1, neuer `tokenId`
  überschreibt Slot). „Immer mit dem Deposit-Token arbeiten" ⇒ zwischen zwei Positionen auf den
  Deposit-Token normalisieren (1 Extra-Swap, dafür konsistent & einfacher zu sizen).
  Zu verifizieren: eine Automation kann diese 5–6 Actions linear verketten (sollte gehen).
- **Auto-Compound** (Pflicht, eigene Interval-Automation): Trigger = IntervalCondition(Compound-Intervall)
  → Collect → Increase (mit den eingesammelten Token-Beträgen). Reine Wiederverwendung; kein neuer Contract.

### 2.5 Single-sided Sizing ab Deposit-Token — verbleibende Design-Entscheidung
Da der Deposit-Token eine LP-Seite IST, lautet die Frage nur noch: **welcher Anteil des Deposit-Tokens
wird in den anderen Token geswappt**, damit die gewählte Range balanciert befüllt wird. Das Verhältnis
ist **nicht** fix 50/50 nach Wert (hängt von Range vs. aktuellem Preis ab, `getAmountsForLiquidity`).
Optionen: (a) Swap-Anteil **off-chain** berechnen (Frontend/MCP) und via Slot/Param reinreichen — am
einfachsten, reuse `lp-math.ts`; (b) on-chain Sizing-Helper-Action; (c) ~50/50-Approx + Dust. **Empfehlung: (a).**

### 2.6 Katalog + Recipe
Seed-Einträge (`paramSchema`/`abiFragment`/Rollen) für die neue(n) Condition(s); ein **Recipe
„Wick & Wait CL"** als Few-Shot. Liefert zugleich die in `add-mcp-server §13` als fehlend notierte
**Preis-Condition-Familie** (price/TWAP). Der neue `step-catalog-integrity`-Guard greift automatisch.

### 2.7 (Optional) Setup-Action für Observation-Cardinality
Einmaliger `increaseObservationCardinalityNext(N)`-Call, falls der Ziel-Pool zu wenig Cardinality hat.
Mini-Action oder manueller Schritt.

---

## 3. Externe Mechanik (TWAP) — die eigentliche „Research"

`function observe(uint32[] secondsAgos) external view returns (int56[] tickCumulatives, uint160[] secondsPerLiquidityCumulativeX128s);`

- **Mittel-Tick über [t−W, t]:** `secondsAgos = [W, 0]` → `meanTick = (tickCumulatives[1] − tickCumulatives[0]) / int56(uint56(W))`.
  Bei negativem Ergebnis Richtung −∞ runden (vgl. Uniswap `OracleLibrary.consult`), sonst leichter Bias.
- **`tickCumulative`** = Σ(tick · Δt) seit Pool-Init; Differenz/Zeit = arithmetischer Mittel-Tick.
- **Cardinality-Gotcha:** Default 1 ⇒ nur Spot. Für ein Fenster W braucht der Pool genug Observations
  (`increaseObservationCardinalityNext` + Warm-up). Auf BSC haben viele PCS-V3-Pools niedrige Cardinality.
- **PancakeSwap V3 = Uniswap-V3-Fork:** `observe` ABI identisch (`PancakeV3Pool`). Quelle: Context7 `/uniswap/docs` Oracle.
- Tick→Preis: `price = 1.0001^tick` (Token1/Token0); on-chain via TickMath/`getSqrtRatioAtTick`, off-chain via vorhandenes `lp-math.ts`.

## 4. Empfohlener Ansatz (eine Zeile)

Neue **TWAP-Range-Breach-Condition** (`observe`-basiert, Fenster W = Wartezeit) als Rebalance-Trigger;
Entry/Rebalance über die **bestehenden** Swap/Mint/Decrease/Collect-Actions; `tokenId` über Context-Slot;
Sizing zunächst off-chain (Frontend/MCP) reinreichen. Minimal-invasiv, nutzt ~90 % vorhandener Bausteine.

## 5. Verbesserungsvorschläge (profitableres DeFi)

1. **TWAP-zentrierter Entry** statt slot0-zentriert: neue Range auf den **TWAP-Tick** zentrieren (gleiches `observe`),
   sonst öffnet man bei einem Wick die Range schief. (Mint rangeMode bräuchte eine TWAP-Variante.)
2. **Preis-Hysterese / Trigger-Band:** Rebalance erst, wenn der TWAP die Range um einen **Puffer** verlässt
   (äußeres Band breiter als die LP-Range) → weniger Thrashing am Rand. Ergänzt die Zeit-Hysterese (Fenster W).
3. **Gas-/Fee-bewusstes Rebalancing:** nur rebalancen, wenn erwarteter Fee-Uplift > Rebalance-Kosten
   (Swap-Fee + Gas + realisierter IL). Mindest-Cooldown via Kombination mit `IntervalCondition` (heute teils ausdrückbar).
4. ~~Auto-Compound~~ → **jetzt Pflicht-Baustein, siehe §2.4** (eigene Interval-Automation, kein neuer Contract).
5. **Volatilitäts-adaptive Range-Breite:** breitere `tickDelta` bei hoher Vol (weniger Churn/IL), enger bei niedriger Vol
   (höhere Fee-Dichte). Breite aus TWAP-Dispersion ableitbar.
6. **Slippage-Schutz auf Rebalance-Swaps:** `SwapAction` shippt heute `amountOutMinimum = 0` (Sandwich-Risiko).
   TWAP-abgeleitetes `minOut` setzen — relevant für Sicherheit **und** Profitabilität.
7. **Fee-Tier-Wahl:** Pool-Fee-Tier mit bestem Fee/Vol-Verhältnis für das Paar wählen.
8. **Asymmetrische/Trend-Range:** Range leicht in TWAP-Drift-Richtung skewen.

## 6. Offene Fragen für die Design-Phase

**Geklärt (User):** Deposit-Token = Basis (single-sided Sizing); Auto-Compound = Pflicht; alle
Strategie-Parameter (Pool/Fee-Tier, W, Range-Breite, Compound-Intervall, Slippage) = **User-Parameter**
(schema-getrieben). Sizing-Empfehlung: off-chain berechnen + reinreichen (Variante a). Rebalance
normalisiert zwischen Positionen auf den Deposit-Token.

**Noch offen:**
- **Wartezeit W** & **Range-Breite** — als freie Params, oder zusätzlich kuratierte Presets im Recipe?
- **Cooldown** zwischen Rebalances gewünscht (gas-/fee-bewusst), oder reicht das TWAP-Fenster als Hysterese?
- **Eine** Rebalance-Automation (close→normalize→reopen in einem Graphen) oder getrennt? Plus die
  separate Auto-Compound-Automation — also **2–3 Automations** pro Strategie-Instanz.
- **Slippage-`minOut`** auf den Strategie-Swaps (heute `0`) — TWAP-abgeleitet erzwingen? (Sicherheit.)
- **Cardinality-Setup**: Pool-Observation-Cardinality als Vorbedingung prüfen/erhöhen — Mini-Action,
  manueller Schritt, oder Frontend-Check vor Aktivierung?
