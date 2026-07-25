# Domain-Doku

Wie die Engineering-Skills die Domain-Doku dieses Repos beim Erkunden der Codebase nutzen
sollen.

## Vor dem Erkunden lies das hier

- **`CONTEXT.md`** im Repo-Root, oder
- **`CONTEXT-MAP.md`** im Repo-Root, falls vorhanden — sie zeigt auf je eine `CONTEXT.md` pro
  Kontext. Lies jede, die zum Thema passt.
- **`docs/adr/`** — lies ADRs, die den Bereich betreffen, an dem du gerade arbeitest. In
  Multi-Kontext-Repos prüfe zusätzlich `src/<kontext>/docs/adr/` für kontext-gebundene
  Entscheidungen.

Existiert eine dieser Dateien nicht, **mach still weiter**. Melde das Fehlen nicht; schlag
nicht vor, sie vorab anzulegen. Der Skill `domain-modeling` (erreicht über `grill-with-docs`
und `improve-codebase-architecture`) legt sie träge an, sobald Begriffe oder Entscheidungen
tatsächlich geklärt werden.

## Dateistruktur

Ein-Kontext-Repo (die meisten Repos):

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

Multi-Kontext-Repo (Vorhandensein von `CONTEXT-MAP.md` im Root):

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← systemweite Entscheidungen
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← kontext-spezifische Entscheidungen
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

## Nutze das Vokabular des Glossars

Wenn dein Output ein Domänen-Konzept benennt (in einem Issue-Titel, einem
Refactoring-Vorschlag, einer Hypothese, einem Testnamen), nutze den Begriff, wie er in
`CONTEXT.md` definiert ist. Weich nicht auf Synonyme aus, die das Glossar explizit vermeidet.

Steht das Konzept, das du brauchst, noch nicht im Glossar, ist das ein Signal — entweder
erfindest du Sprache, die das Projekt nicht nutzt (überdenke das), oder es gibt eine echte
Lücke (notiere sie für `domain-modeling`).

## ADR-Konflikte melden

Widerspricht dein Output einer bestehenden ADR, mach das explizit sichtbar, statt sie
stillschweigend zu übergehen:

> _Widerspricht ADR-0007 (event-sourced orders) — aber wert, das wieder aufzumachen, weil…_
