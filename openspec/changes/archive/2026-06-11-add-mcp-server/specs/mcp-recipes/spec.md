## ADDED Requirements

### Requirement: Kuratierte Recipe-Shapes

Das System SHALL kuratierte Beispiel-Shapes als Recipe-Tabelle (Prisma-Entity + Migration) bereitstellen, über einen Lese-Endpunkt ausliefern und über das MCP-Tool `list_recipes` an den Agenten reichen. Der MVP-Satz (HITL-kuratiert, mit dem heutigen Katalog ausdrückbar) ist: **DCA**, **Interval Aave Supply**, **PancakeSwap Auto-Reinvest** und **Interval Rebalance**. Preis-getriggerte Strategien (Stop-Loss) und Health-Factor-Schutz SHALL ausgelassen werden, bis entsprechende Preis-/HF-Conditions existieren (kein erfundenes Few-Shot-Beispiel). Recipes SHALL Shapes mit Platzhaltern sein: stabile Step-Type-Namen, keine konkreten Contract-/Token-Adressen, Werte als Platzhalter (`TOKEN_IN`, `BETRAG`, `INTERVALL`). Recipes SHALL keine harten Templates sein, denen der Graph entsprechen muss.

#### Scenario: Recipes als Few-Shot-Referenz abrufen

- **WHEN** der Agent `list_recipes` aufruft
- **THEN** erhält er die kuratierten Shapes (DCA, Interval Aave Supply, PancakeSwap Auto-Reinvest, Interval Rebalance) als Platzhalter-Formen (stabile Step-Type-Namen, keine Adressen), JSON-konsumierbar

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
