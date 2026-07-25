---
created: 2026-07-25
last_verified: 2026-07-25
git_commit: 7ca671beafc34c201d4980a6ef66297bec67aa7f
extrahiert: aus-bestandscode
---

# Problem-Statement: Encode-Boundary (Reverse-Spec aus Bestandscode)

> **Ehrlichkeits-Hinweis:** Dieses Dokument ist eine **Rekonstruktion** aus dem
> Bestandscode in `packages/shared/src` (Stand Commit oben) — kein Original-Diskovery-Artefakt.
> Motivation und Zielbild sind aus Code-Kommentaren, Tests und der eingefrorenen
> Legacy-Spec (`docs/legacy-specs/shared-encode-boundary/spec.md`) abgeleitet.

## Problem

Strategie-Graphen werden im Editor (Frontend) und im MCP-Server in einer
**menschenfreundlichen** Form gehalten: Dauern als `{ value, unit }`,
Token-Beträge als Dezimal-Strings („1.5"), Zero-Toggles als Booleans,
Startzeiten als eigenes Feld. Der Backend-ABI-Encoder (`POST /encode`) erwartet
dagegen **raw**-Werte: Sekunden, Base-Units als uint256-Strings, nur die Keys
des ABI-Fragments.

Existieren zwei Implementierungen dieses friendly→raw-Schritts (eine im
Frontend, eine im MCP), driften sie zwangsläufig auseinander: derselbe Graph
würde je nach Client unterschiedlich encodiert — im schlimmsten Fall mit
falschen On-Chain-Beträgen oder Deploy-Reverts, die erst zur Laufzeit auffallen.
Genau dieser Zustand existierte historisch (Kopie in
`features/automation-editor/lib/encode-boundary.ts`, laut Legacy-Spec entfernt).

Zusätzlich: Präzision. Token-Beträge überschreiten `2^53`; jede Umrechnung über
JavaScript-`number` verliert stillschweigend Stellen. Und Fehlkonfigurationen
(Zero-Adresse als Token, Target-HF unter dem On-Chain-Floor, invertierte
Tick-Ranges) würden ohne Vorab-Validierung erst als On-Chain-Revert sichtbar.

## Zielbild

**Eine einzige, framework-freie Quelle** in `packages/shared` für:

1. den friendly→raw-Mapper (`mapGraphToRaw`, `mapParamsToRaw`,
   `buildContextOverrides`) direkt vor `POST /encode`,
2. die Unit-Konvertierungen (Dauer→Sekunden, Betrag→Base-Units,
   Timestamp→ABI-uint256-Hex) — pure, IO-frei, BigInt-basiert,
3. die schema-getriebene Parameter-Validierung (`validateParams`) mit zwei
   Modi: `friendly` (Editor) und `raw` (defensiver Backend-Guard), gesteuert
   über `x-ui-*`-Metadaten statt per-Step-Type-Code.

Frontend (Deploy-Dialog), MCP-Server (propose-automation) und Backend
(Catalog-Integrity) konsumieren dieselbe Version über die `exports`-Map von
`shared` — keine Zweitimplementierung, kein Drift.

## Messbares Ziel (rekonstruiert)

- Genau **eine** Implementierung der Boundary im Repo; Frontend und MCP
  importieren aus `shared` (belegbar: `packages/frontend/src/features/automation-editor/components/deploy-dialog.tsx`,
  `packages/mcp/src/tools/propose-automation.ts`).
- Derselbe friendly-Graph erzeugt in allen Clients bit-identische raw-Params
  (uint256 als String, keine `number`-Rundung).
- Fehlkonfigurationen, die on-chain revertieren würden (Zero-Token, Target-HF
  ≤ 1.05, tickLower ≥ tickUpper, ungültige Fee-Tier, Prozent außerhalb 1–100),
  werden bereits an der Boundary bzw. am `/encode`-Guard (HTTP 400) abgefangen.
- Table-driven Mapper-/Validator-Tests laufen in `shared` ohne LLM und ohne
  Chain (`packages/shared/src/*.test.ts`).
