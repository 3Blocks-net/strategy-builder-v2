---
created: 2026-07-25
last_verified: 2026-07-25
git_commit: 7ca671beafc34c201d4980a6ef66297bec67aa7f
extrahiert: aus-bestandscode
---

# Problem-Statement: Strategy-Graph-Editor

> **Hinweis zur Herkunft:** Dieses Problem-Statement ist eine ehrliche Rekonstruktion
> aus dem Bestandscode (`packages/frontend/src/features/automation-editor/`), nicht das
> Ergebnis eines Fach-Interviews. Es beschreibt das Nutzerproblem so, wie der
> beobachtbare Code es implizit beantwortet.

## Nutzerproblem

Ein Vault-Besitzer will DeFi-Strategien (z. B. „wenn Bedingung X erfüllt ist, führe
Swap/Supply/Rebalance Y aus") auf seinem selbstverwahrten Smart-Contract-Vault (BSC)
automatisieren. Ohne Werkzeug müsste er dafür:

- Solidity-/ABI-Wissen mitbringen (Selektoren, Base-Units, Ticks, Context-Slots),
- Ausführungsreihenfolgen und Verzweigungen fehlerfrei von Hand kodieren,
- Fehlkonfigurationen (nicht existierender PancakeSwap-Pool, Zero-Address,
  ungültige Tick-Ranges, Health-Factor unter dem On-Chain-Floor) erst als teuren
  Runtime-Revert on-chain entdecken.

Das ist für Nicht-Entwickler unzugänglich und für Entwickler fehleranfällig.

## Zielbild (aus dem Code abgeleitet)

Ein visueller Graph-Editor, in dem der Nutzer eine Automation als Ablaufgraph aus
**Condition-** und **Action-Knoten** zusammenklickt:

- Steps kommen aus einem server-seitigen Katalog (`GET /step-types`); ihre Formulare
  werden **schema-getrieben** aus `paramSchema`/`x-ui-*`-Hints gerendert — kein
  Per-Step-Code im Editor (Beleg: `dynamic-form.tsx`).
- Eingaben sind „friendly" (menschliche Beträge, Dauern mit Einheit, ±%-Ranges,
  Datums-Picker); die Umrechnung in Raw-/Base-Units passiert erst an der
  Encode-Boundary (`mapGraphToRaw` aus `shared`) beim Deploy.
- Fehler werden **vor** dem Deploy sichtbar gemacht: Struktur-Regeln des Graphen,
  schema-getriebene Parameter-Validierung über alle Knoten (auch nie geöffnete) und
  ein asynchroner On-Chain-Check (PancakeSwap-Pool-Existenz) speisen eine gemeinsame
  Fehlerliste, die den Deploy-Button hart sperrt.
- Arbeit geht nicht verloren: Draft wird sofort angelegt, Auto-Save alle 5 s bei
  Änderungen, Warnung beim Schließen mit ungespeicherten Änderungen, Undo/Redo mit
  50 Schritten Historie.
- Deploy ist ein geführter Wallet-Flow (1–2 Transaktionen, Preview von Step-Zahl,
  Typ Public/Owner-only und Context-Slot-Änderungen inkl. „Shared"-Warnung), an
  dessen Ende die On-Chain-ID aus dem Event gelesen und im Backend bestätigt wird.

## Messbares Ziel (rekonstruiert)

Der Code optimiert erkennbar auf: **„Keine Automation erreicht die Chain, die der
Editor als ungültig erkennen konnte."** Operationalisierbar als:

1. Deploy ist nur bei 0 Validierungsfehlern möglich (`editor-toolbar.tsx`:
   `disabled={errorCount > 0}`).
2. Bekannte On-Chain-Reverts (ZeroToken, InvalidTicks, InvalidPercent,
   Target-HF-Floor 1,05, fehlender Pool) werden bereits zur Konfigurationszeit als
   Editor-Fehler gespiegelt (`shared/validation.ts`, `pool-validity.ts`).
3. Kein Datenverlust im Entwurfsprozess: dirty-State → Auto-Save nach 5 s bzw.
   `beforeunload`-Warnung (`use-auto-save.ts`).

Explizite Produktmetriken (Conversion, Time-to-Deploy o. ä.) sind im Code nicht
belegt — offene Frage für die Fachseite.
