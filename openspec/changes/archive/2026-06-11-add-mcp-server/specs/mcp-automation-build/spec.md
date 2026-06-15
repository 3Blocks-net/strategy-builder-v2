## ADDED Requirements

### Requirement: propose_automation (Build mit Encode-Boundary, kein Deploy)

Das System SHALL das Tool `propose_automation` bereitstellen, das einen Agent-Graphen über den `shared`-Mapper (`mapGraphToRaw`) in einen raw graph überführt und über das bestehende `POST :address/automations/:id/encode` (defensiv `validateParams(mode:'raw')` + Raw-Mode-Guards) validiert. Ungültige Graphen SHALL mit Erklärung abgelehnt werden (kein Deploy). Es SHALL in diesem Schritt nicht signiert werden.

#### Scenario: Ungültiger Graph wird abgelehnt

- **WHEN** ein ungültiger Graph an `propose_automation` gegeben wird
- **THEN** wird er über das bestehende `/encode` abgelehnt, mit Erklärung was fehlt/falsch ist, und nichts wird deployt

### Requirement: Server-interner Draft-Store

Das System SHALL einen validierten Entwurf server-intern im MCP-Prozess ablegen (in-memory, pro Session, mit TTL) und als Draft-ID zurückgeben. Das LLM SHALL keine Möglichkeit erhalten, den abgelegten Entwurf zwischen propose und deploy zu mutieren.

#### Scenario: Validierter Entwurf als Draft-ID

- **WHEN** ein gültiger Graph vorgeschlagen wird
- **THEN** wird er server-intern abgelegt und als Draft-ID (mit TTL) zurückgegeben, ohne dass das LLM ihn nachträglich ändern kann

### Requirement: Intent-Cross-Check

Das System SHALL einen vom Agenten deklarierten flachen Intent (`execution`, `trigger {typ, periode}`, geordnete Action-Liste `{action, token, richtung, betrag}`) gegen den per `SummaryDecoder` decodierten raw graph prüfen und bei Abweichung Intent ≠ Graph ablehnen — inklusive `execution`-Intent ≠ abgeleitete Topologie. Verzweigte Graphen SHALL als „nicht voll cross-checkbar" markiert werden.

#### Scenario: Intent ≠ Graph → Reject mit Diff

- **WHEN** der deklarierte Intent vom decodierten Graphen abweicht
- **THEN** wird mit einem Diff abgelehnt

#### Scenario: execution-Intent ≠ Topologie

- **WHEN** der `execution`-Intent der abgeleiteten Topologie widerspricht
- **THEN** wird abgelehnt

#### Scenario: Verzweigter Graph wird markiert

- **WHEN** ein verzweigter Graph vorgeschlagen wird
- **THEN** wird er als „nicht voll cross-checkbar" markiert

### Requirement: Validity-Checks vor Deploy

Das System SHALL vor Deploy die Pool-Existenz (`factory.getPool(tokenIn, tokenOut, fee)` via viem gegen den RPC) prüfen und die Token-Allowlist über die `tokenDecimals`-Auflösung im Mapper durchsetzen (ein nicht-kuratierter Token bricht den Build hart ab). Es SHALL keine erfundenen Adressen/Selektoren verwendet werden — nur seed-/katalog-gestützte StepTypes.

#### Scenario: Nicht existierender Pool

- **WHEN** der benötigte Pool/Tier nicht existiert
- **THEN** wird der Build vor einer TX klar abgelehnt

#### Scenario: Nicht-kuratierter Token

- **WHEN** ein Token nicht in den `/tokens/*`-Listen auflösbar ist
- **THEN** bricht der Build vor dem Signieren hart ab

#### Scenario: Prompt-Injection am Cross-Check vorbei

- **WHEN** ein injizierter Versuch am Cross-Check vorbei bauen will
- **THEN** wird er abgelehnt
