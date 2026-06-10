# `propose_automation` + Intent-Cross-Check (Build ohne Deploy)

## Parent PRD

mcp-integration.md

## What to build

Der Nutzer beschreibt eine Strategie in natürlicher Sprache; der Agent assembliert **frei**
aus dem Katalog (angeleitet durch Recipe-Shapes) einen Graphen, der **vor** jedem Deploy
validiert wird — ohne zu signieren.

- **`propose_automation`:** Agent-Graph → `shared`-Mapper (`mapGraphToRaw` aus Slice 02) →
  bestehendes `POST :address/automations/:id/encode` (defensiv `validateParams(mode:'raw')`
  + Raw-Mode-Guards). Ungültige Graphen werden **abgelehnt** (kein Deploy) mit Erklärung,
  was fehlt/falsch ist. Validierter Entwurf wird **server-intern im MCP-Prozess** abgelegt
  (in-memory, pro Session, TTL) und als **Draft-ID** zurückgegeben.
- **Intent-Cross-Check:** der Agent deklariert einen **flachen Intent** (`execution`,
  `trigger {typ, periode}`, geordnete Action-Liste `{action, token, richtung, betrag}`);
  der Server decodiert den raw graph via `SummaryDecoder` (Slice 07) und **lehnt bei
  Abweichung Intent ≠ Graph ab** (inkl. `execution` ≠ abgeleiteter Topologie). **Verzweigte
  Graphen** werden als „nicht voll cross-checkbar" markiert.
- **Validity-Checks vor Deploy:** Pool-Existenz (`factory.getPool` via viem) und Token-
  Allowlist (greift über die `tokenDecimals`-Auflösung im Mapper — nicht-kuratierter Token
  → harter Fail).

Read-until-Deploy → **kein Signieren** in diesem Slice. Siehe PRD _AI-Building (Story 5)_.

## Acceptance criteria

- [ ] `propose_automation` baut den raw graph über den `shared`-Mapper und validiert über das bestehende `/encode`; ungültige Graphen werden mit Erklärung abgelehnt (kein Deploy).
- [ ] Validierter Entwurf wird server-intern abgelegt und als Draft-ID zurückgegeben (TTL); das LLM erhält keine Möglichkeit, den abgelegten Entwurf zu mutieren.
- [ ] Intent ≠ decodierter Graph → **Reject mit Diff**; `execution`-Intent ≠ abgeleitete Topologie → Reject; verzweigter Graph wird markiert.
- [ ] Pool-Existenz- und Token-Allowlist-Check greifen vor Deploy; nicht existierender Pool/Tier bzw. nicht-kuratierter Token → klare Ablehnung **vor** TX.
- [ ] Entwurf-zuerst: der Agent kann einen validierten Graphen vorschlagen, ohne zu deployen; keine erfundenen Adressen/Selektoren (nur seed-/katalog-gestützte StepTypes).
- [ ] Prompt-Injection-Testfall: ein injizierter Versuch, am Cross-Check vorbei zu bauen, wird abgelehnt.

## Blocked by

- Blocked by #02
- Blocked by #05
- Blocked by #07

## User stories addressed

- User story 31
- User story 32
- User story 33
- User story 36
- User story 37
- User story 38
