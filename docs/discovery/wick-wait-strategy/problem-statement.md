---
created: 2026-07-25
last_verified: 2026-07-25
git_commit: 7ca671beafc34c201d4980a6ef66297bec67aa7f
extrahiert: aus-bestandscode
---

# Problem Statement: Wick-and-Wait-Strategie (Rekonstruktion aus Bestandscode)

> **Hinweis zur Herkunft:** Dieses Dokument ist eine **Reverse-Spec** — rückwärts aus dem
> implementierten Code extrahiert (Contracts, Backend-Seed, Fork-Tooling), abgeglichen mit den
> eingefrorenen Legacy-Specs (`docs/legacy-specs/twap-range-condition`,
> `docs/legacy-specs/wick-wait-recipes`). Es beschreibt den **beobachtbaren Ist-Contract**, nicht
> eine ursprüngliche Produktabsicht. Wo Absicht vermutet wird, ist das gekennzeichnet.

## Problem

Concentrated-Liquidity-Positionen (PancakeSwap V3 auf BSC) verdienen nur Fees, solange der
Preis in ihrer Range liegt. Naive Rebalance-Automationen haben zwei Kernprobleme:

1. **Wicks:** Kurze Preis-Spikes, die sofort zurückkehren, lösen bei einem Spot-Preis-Trigger
   ein unnötiges Rebalance aus — die Position wird geschlossen und teurer neu eröffnet, obwohl
   sie ohne Eingriff weiter Fees verdient hätte. Zusätzlich verursacht jedes Rebalance
   Swap-Kosten und Keeper-Gas.
2. **Stale Sizing:** Die Automation feuert zu einem Keeper-gewählten Zeitpunkt. Ein zur Bauzeit
   fest einkodierter Swap-Betrag für das Token-Verhältnis der neuen Position ist beim tatsächlichen
   Ausführen veraltet — die Position würde mit falschem Verhältnis gemintet und ein großer Rest
   bliebe ungenutzt liegen.

## Lösung im Bestand (Ist-Zustand)

Die Wick-and-Wait-Strategie löst beide Probleme on-chain:

- **`WickWaitRebalanceCondition`** (`packages/contracts/contracts/examples/conditions/WickWaitRebalanceCondition.sol`):
  triggert nur, wenn der **zeitgewichtete Durchschnitts-Tick (TWAP)** über ein Fenster `W` die
  Range der offenen Position verlassen hat **und** ein Cooldown seit dem letzten Rebalance
  abgelaufen ist. Kurze Wicks verschieben den Mittelwert kaum → kein Trigger.
- **`PancakeSwapV3SwapToRangeRatioAction`** (`packages/contracts/contracts/actions/PancakeSwapV3SwapToRangeRatioAction.sol`):
  berechnet **zur Ausführungszeit** aus dem Live-Pool-Preis das Ziel-Wertverhältnis token0/token1
  für die Range `tick ± tickDelta` und swappt den überrepräsentierten Token dorthin. Ein
  nachfolgendes `Mint(full balance)` providet dann alles Gehaltene (Rest = Dust).
- **Drei Seed-Recipes** (`packages/backend/src/recipe/recipe-seed-data.ts`): Entry
  (Size → Mint), Rebalance (WickWait-Trigger → Collect → Decrease 100% → SwapToRangeRatio → Mint)
  und Auto-Compound (Interval → Collect → Fee Deposit → Increase).
- **Fork-Price-Driver** (`packages/contracts/scripts/wick-wait-price-driver.ts`): Dev-Tooling,
  das auf dem lokalen BSC-Fork (BTCB/USDT) den Preis gezielt aus der Range treibt — Modus
  `persistent` (Trigger soll feuern) vs. `wick` (Trigger soll nicht feuern) — um das
  Condition-Verhalten beobachtbar zu machen.

## Wer hat das Problem?

- **Vault-Besitzer** (Self-Custody-DeFi-Nutzer), die eine CL-Position passiv laufen lassen wollen,
  ohne bei jedem Spike gebührenfressend rebalanced zu werden.
- **Strategie-Bauer** (Frontend-Graph-Editor / MCP-Assistent), die die Strategie aus
  katalogisierten StepTypes zusammenstecken, ohne Sizing-Mathematik selbst zu rechnen.
- **Entwickler**, die das Zeitverhalten (TWAP + Cooldown) lokal reproduzierbar testen müssen.

## Erfolgskriterium (implizit, aus Code/Tests abgeleitet)

Ein transienter Ausreißer innerhalb `W` löst kein Rebalance aus; ein persistenter Range-Bruch löst
genau eines pro Cooldown-Periode aus; die neu eröffnete Position ist unabhängig vom
Ausführungszeitpunkt annähernd korrekt sized (Restbestand ist Dust).
