## ADDED Requirements

### Requirement: Kuratierte Recipe-Shapes

Das System SHALL kuratierte Beispiel-Shapes (mind. DCA, Stop-Loss, HF-Schutz) als Recipe-Tabelle (Prisma-Entity + Migration) bereitstellen, über einen Lese-Endpunkt ausliefern und über das MCP-Tool `list_recipes` an den Agenten reichen. Recipes SHALL Shapes mit Platzhaltern sein: stabile Step-Type-IDs, keine konkreten Contract-/Token-Adressen, Werte als Platzhalter (`TOKEN_IN`, `BETRAG`, `INTERVALL`). Recipes SHALL keine harten Templates sein, denen der Graph entsprechen muss.

#### Scenario: Recipes als Few-Shot-Referenz abrufen

- **WHEN** der Agent `list_recipes` aufruft
- **THEN** erhält er DCA-, Stop-Loss- und HF-Schutz-Shapes als Platzhalter-Formen (Step-Type-IDs, keine Adressen), JSON-Schema-konsumierbar

### Requirement: Seed-Validierung gegen den Katalog

Das System SHALL jedes Recipe beim Seed gegen den aktuellen Katalog validieren; ein Recipe mit unbekanntem Step-Type oder Param-Drift SHALL nicht ausgeliefert werden.

#### Scenario: Ungültiges Recipe wird nicht ausgeliefert

- **WHEN** ein Recipe einen unbekannten Step-Type oder Param-Drift enthält
- **THEN** wird es vom Seed nicht ausgeliefert

### Requirement: Nur team-kuratierte Recipes

Das System SHALL Recipes ausschließlich seed-/team-kuratiert führen; es SHALL keinen Schreibpfad für User oder Community geben.

#### Scenario: Kein User-Schreibpfad

- **WHEN** ein nicht-kuratierter Akteur ein Recipe schreiben wollte
- **THEN** existiert kein Schreibpfad; Recipes bleiben ausschließlich seed-/team-kuratiert
