# Recipes (Few-Shot-Referenz-Shapes)

## Parent PRD

mcp-integration.md

## What to build

Der Agent kann **kuratierte Beispiel-Shapes** abrufen (DCA, Stop-Loss, HF-Schutz), um gute
Graph-Formen zu lernen, **bevor** er frei assembliert. Recipes sind **Shapes mit
Platzhaltern**: stabile **Step-Type-IDs**, **keine** konkreten Contract-/Token-Adressen,
Werte als Platzhalter (`TOKEN_IN`, `BETRAG`, `INTERVALL`) — robust gegen Redeploy-Adress-
Drift. **Keine** harten Templates, denen der Graph entsprechen muss.

Umfang: Recipe-Tabelle (Prisma-Entity) + Seed + Lese-Endpunkt (analog/neben `/step-types`)
+ MCP-Tool `list_recipes`. Der Seed **validiert jedes Recipe gegen den aktuellen Katalog**
(unbekannter Step-Type / Param-Drift → wird nicht ausgeliefert). Recipes sind **nur team-
kuratiert**, nie user-/community-schreibbar. Siehe PRD _AI-Building (Story 5) → Recipes_ und
_Backend-Änderungen_.

**HITL:** die Kuratierung (welche Strategien, welche Shapes) ist eine Produktentscheidung
und braucht Review.

## Acceptance criteria

- [ ] Prisma-Recipe-Entity + Migration; Seed mit mind. DCA, Stop-Loss, HF-Schutz als Shape-mit-Platzhaltern (Step-Type-IDs, keine Adressen).
- [ ] Lese-Endpunkt liefert Recipes JSON-Schema-konsumierbar; `list_recipes` reicht sie an den Agenten.
- [ ] Seed-Validierung: ein Recipe mit unbekanntem Step-Type oder Param-Drift wird **nicht** ausgeliefert (Test).
- [ ] Recipes sind ausschließlich seed-/team-kuratiert; kein Schreibpfad für User/Community.

## Blocked by

- Blocked by #01

## User stories addressed

- User story 24
