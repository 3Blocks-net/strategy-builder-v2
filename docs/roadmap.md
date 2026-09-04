---
created: 2026-09-04
last_verified: 2026-09-04
status: in-arbeit
---

# Pecunity — Roadmap

Die Reihenfolge, in der das Zielbild aus `docs/produkt.md` gebaut wird. Neun
Meilensteine, keine Kalenderdaten: Was zuerst kommt, ergibt sich aus
Abhängigkeiten und aus dem Grundsatz „Vertrauen vor Kasse", nicht aus einem
Termin. Jeder Meilenstein existiert als GitHub-Milestone im Repo, jedes Epic als
Issue.

Bei Widerspruch gewinnt `docs/produkt.md`. Die strategischen Entscheidungen, auf
denen diese Reihenfolge steht, liegen in
`docs/discovery/produkt-strategie/analyse.md`, Abschnitt F. Für die Schreibweise
von Finanzbegriffen gilt `CLAUDE.md`, Abschnitt „Konventionen / Finanzbegriffe".

## Ausgangslage

Nichts läuft produktiv. Der gesamte Code ist änderbar; der Technik-Stack
(pnpm-Monorepo, NestJS/Prisma, React 19/Vite, Solidity/Hardhat, MCP) bleibt.
Gebaut sind: eigener Vault per permissionless Factory, Actions für PancakeSwap V3
und Aave V3, Graph-Editor, Portfolio-Cockpit mit Wertverlauf und flow-adjustiertem
PnL, Execution-Indexer, Anmeldung per Wallet-Signatur (SIWE), KI-Copilot als
lokales Werkzeug. Offen ist alles, was aus diesem Werkzeug ein Produkt macht.

## Die angekündigten Eigenschaften

Sechs Eigenschaften sind öffentlich zugesagt. Sie sind damit verbindlich — aber
nicht alle gleich früh. Wo sie landen:

| Zugesagt | Stand heute | Meilenstein |
|---|---|---|
| Einfache Bedienung | Nur der Experten-Weg existiert (Graph-Editor) | M8, vorbereitet durch M0 und M5 |
| Neues Credits-System | Entschieden, nichts gebaut | M4 (braucht den Discount Vector aus M3) |
| Strategien per Drag & Drop | Gebaut und tragfähig | M5 (vertiefen, nicht neu bauen) |
| Strategien mit KI erstellen | Kern gebaut, aber nur lokal am Entwickler-Rechner | M7 |
| Gute Übersicht der DeFi-Positionen | Größtenteils gebaut | M2 (vollenden: Frische, Alerts) |
| Multichain (erst EVM) | Nur BSC; Datenmodell kennt bereits `chainId` | M6 |

**Warum das Angekündigte nicht zuerst kommt.** Entscheidung vom 27.07.2026,
bestätigt am 04.09.2026: Der Power-User bleibt der Einstiegsmarkt. Die
Ankündigung beschreibt das Zielbild, nicht die Bau-Reihenfolge. Zwei Gründe:
Einsteiger lehnen sich an ein Fundament, das heute nicht trägt (kein
Slippage-Schutz, keine Curated Registry, kein Security-Review) — und ein
einfacher Weg auf ungesichertem Untergrund ist kein Produktvorteil, sondern ein
Haftungsrisiko. Wer eine frühere Auslieferung des einfachen Weges will, muss
diese Entscheidung bewusst umdrehen, nicht die Roadmap umsortieren.

## Regeln der Reihenfolge

1. **Absicherung vor Geld.** Nichts, das Fees nimmt, geht vor dem
   Absicherungs-Paket und dem Security-Review live.
2. **Wurzel vor Ast.** Der Discount Vector on-chain (M3) ist die einzige Stelle,
   an der Fees null werden können — das Credits-System (M4) hängt daran.
3. **Tiefe vor Breite.** Erst funktioniert eine Chain und ein Nutzertyp
   vollständig, dann kommen weitere dazu.

## Übersicht

Jeder Meilenstein liegt als GitHub-Milestone im Repo, jedes Epic als Issue mit
Akzeptanzkriterien und Fundstellen. Die Blockaden sind als echte
Issue-Abhängigkeiten hinterlegt und dadurch in GitHub sichtbar. Was sich nicht
gegenseitig blockiert, darf parallel laufen (siehe `AGENTS.md`,
„Arbeitsweise / Parallel arbeiten").

| Meilenstein | Epic-Issues | Blockiert von |
|---|---|---|
| M0 — Fundament fertigstellen | [#1](../../issues/1) Frontend-Umbau · [#2](../../issues/2) Sicherheits-Baseline | — |
| M1 — Absicherung ist Standard | [#3](../../issues/3) Epic A | #1, #2 |
| M2 — Stille heißt nachweisbar „alles in Ordnung" | [#4](../../issues/4) Epic D | #3 |
| M3 — Fee-Fundament on-chain | [#5](../../issues/5) Epic B · [#6](../../issues/6) Security-Review | #3, #5 |
| M4 — Credits-System | [#7](../../issues/7) Epic C | #5 |
| M5 — Strategie-Baukasten vertiefen | [#8](../../issues/8) Epic E | #3 |
| M6 — Multichain (erst EVM) | [#9](../../issues/9) Epic F | #4 |
| M7 — KI-Copilot im Web | [#10](../../issues/10) Epic G | #3, #8 |
| M8 — Der einfache Weg | [#11](../../issues/11) Epic H | #3, #4, #6 |

Die Epics sind absichtlich grob. Zerlegt wird jeweils erst, wenn der
Meilenstein dran ist — für M1 liegt das PRD bereits vor, dort kann direkt
geschnitten werden.

---

## M0 — Fundament fertigstellen

**Ziel:** Das Repo und die Oberfläche sind in einem Zustand, auf dem gebaut
werden kann.

Der Frontend-Umbau (Design-System, App-Shell, öffentliche Discovery-Seite)
liegt unfertig im Arbeitsverzeichnis. Solange er nicht abgeschlossen ist,
arbeitet jede weitere Oberflächen-Änderung gegen einen wandernden Untergrund.
Dazu kommen vier Betriebs-Punkte aus `docs/offene-punkte.md`, die seit dem
Tracker-Wechsel offen sind.

**Inhalt**
- Design-System und App-Shell konsolidieren, Tests grün, committet
- Logo-Dateien aus dem Brand-Kit ins Repo holen (heute nicht vorhanden)
- Zweisprachigkeit DE/EN in der Oberfläche einziehen — die Sprachwahl ist
  entschieden, der technische Mechanismus ist eine Umsetzungsfrage
- Secret-Scan über die volle Git-Historie
- Branch-Schutz auf `main`
- Entscheidung zu den verbleibenden Dev-Toolchain-CVEs
- Verwaiste Vaults nach Fork-Neustart sauber melden statt kryptisch loggen

**Fertig wenn:** `pnpm lint` und alle Test-Suiten sind grün, der Umbau ist
committet, die Oberfläche läuft in beiden Sprachen, die vier Betriebs-Punkte
sind erledigt oder bewusst vertagt.

---

## M1 — Absicherung ist Standard

**Ziel:** Ein Standard-Vault kann strukturell nicht mehr durch eine bösartige
Action oder einen ungeschützten Swap geleert werden.

Das ist der einzige Meilenstein, für den bereits ein vollständiges PRD
existiert: `docs/prd/absicherungs-paket.md`, 12 Stories, fachlich abgenommen.
Er schließt die zwei bewusst ausgelieferten Risiken: Swap ohne Slippage-Schutz
und beliebige delegatecall-Targets als Step.

**Inhalt**
- Curated Registry on-chain mit eigener Kurator-Rolle
- Standard-Vaults lehnen unkuratierte Targets ab; Experten-Modus als bewusster
  Opt-out pro Vault, mit ausdrücklicher Warnbestätigung
- Pflicht-Toleranz auf jedem Swap, on-chain als minOut gegen den Pool-TWAP
  erzwungen, mit Fallback auf Spot bei halbierter Toleranz
- Preis-Schock-Preview vor dem Deploy (±10/20/50 %)
- Schutz-Status im Cockpit sichtbar
- Belegt: Der KI-Copilot erbt dieselben Regeln, es gibt keinen Umgehungsweg

**Fertig wenn:** Alle 12 Stories abgenommen, Fork-Durchstich end-to-end grün,
und im Katalog existiert keine swappende Action ohne minOut-Pfad.

**Hängt an:** M0.

---

## M2 — Stille heißt nachweisbar „alles in Ordnung"

**Ziel:** Der Nutzer erfährt von Problemen, ohne hinzusehen — und sieht, dass
kein Alert auch wirklich „geprüft und in Ordnung" bedeutet.

Das Backend kennt fehlgeschlagene Executions bereits, behält sie aber für sich:
Der Nutzer erfährt davon nur, wenn er das Cockpit öffnet. Für etwas, das
unbeaufsichtigt laufen soll, ist das der größte offene Widerspruch zum
Produktversprechen. Hier wird zugleich die zugesagte Positions-Übersicht
vollendet.

**Inhalt**
- Alerts bei fehlgeschlagener Execution, kritischem Health Factor und fast
  leerem Gas-Depot (Kanal noch zu entscheiden)
- Sichtbarer Frische-Status auf jeder Übersichtsseite
- Zuständigkeit und Verhalten der Keeper festlegen: Wer führt aus, mit welcher
  Zusage, was passiert bei Ausfall
- Kontoseite mit Alert-Einstellungen (Route existiert noch nicht)

**Fertig wenn:** Ein Nutzer mit fehlgeschlagener Automation wird ohne eigenes
Zutun informiert, und das Ausfallverhalten der Keeper ist dokumentiert und
getestet.

**Hängt an:** M1 (der Schutz-Status ist Teil dessen, was gemeldet wird).

---

## M3 — Fee-Fundament on-chain

**Ziel:** Fees sind fair, nachvollziehbar und an einer Stelle steuerbar.

Der Discount Vector ist die technische Wurzel: Er ist die einzige Stelle, an der
Fees für einen Nutzer auf null gesetzt werden können — ohne ihn ist das
Credits-System (Meilenstein M4) nicht baubar. Er ist zugleich der risikoärmste
Teil.

**Inhalt**
- Discount Vector on-chain (Wurzel, blockiert alles Weitere)
- Performance Fee 15 % über der High-Water-Mark
- Management Fee 1–2 % p. a.; die genaue Höhe wird vor der Umsetzung validiert
  (die ursprünglich geplanten 5 % wurden am 27.07.2026 als markt-untypisch verworfen)
- Interner Security-Review — verbindlich am Ende dieses Meilensteins

**Fertig wenn:** Die drei Fee-Bausteine sind auf dem Fork durchgestochen und der
Security-Review ist abgeschlossen.

**Hängt an:** M1 (der Review-Umfang enthält das Absicherungs-Paket).

---

## M4 — Credits-System

**Ziel:** Nutzer zahlen wahlweise vorab per Credits statt bei jeder Aktion
on-chain — die zugesagte zweite Schiene.

Zwei Rails, eine Rechen-Quelle: Wer Credits hat, dem werden die On-Chain-Fees
über den Discount Vector auf null gesetzt; abgerechnet wird off-chain gegen das
Guthaben. Wer keine Credits hat, zahlt normal über die Contracts. Die
off-chain-Rechnung **muss** dieselbe Quelle nutzen wie die on-chain-Rechnung —
dasselbe Drift-Verbot wie an der Encode-Boundary.

**Inhalt**
- Credits kaufen, Credit-Ledger mit vollständiger Bewegungs-Historie
- Fee-Engine off-chain, aus derselben Quelle wie on-chain
- Abgleich mit dem Discount Vector, inklusive Umschaltung bei Guthaben null
- Abrechnungs-Ansicht: der Nutzer sieht jederzeit, wofür er bezahlt hat
- Gas Compensation im Credits-Rail

**Fertig wenn:** Ein Nutzer kann Credits kaufen, eine Automation ausführen
lassen, und die abgerechneten Beträge stimmen nachweisbar mit dem überein, was
on-chain angefallen wäre.

**Hängt an:** M3 (Discount Vector).

---

## ▶ Produktivgang-Gate

Kein Meilenstein, sondern eine Schranke. Vor dem ersten echten Geld auf
Mainnet müssen gelten:

- Absicherungs-Paket vollständig (M1)
- Interner Security-Review **abgeschlossen**, kritische Findings behoben
- Alerts aktiv (M2)
- Fee-Abrechnung nachvollziehbar, beide Rails identisch (M3, M4)

Diese Schranke ist eine Entscheidung von Florian, keine automatische Folge
grüner Tests.

**Eine Einschränkung, die bewusst getragen wird:** Ein interner Review ist kein
externes Audit. Nach außen darf er auch nicht als solches auftreten — die
Discovery-Seite und jede Marketing-Aussage sprechen von interner Prüfung oder
gar nicht von Prüfung. Ob später ein externes Audit dazukommt, ist offen und
gehört dann in einen eigenen Meilenstein.

---

## M5 — Strategie-Baukasten vertiefen

**Ziel:** Der Power-User baut mehr Strategien als heute — und der Editor fühlt
sich fertig an.

Drag & Drop ist zugesagt und existiert. Was fehlt, ist Auswahl: Heute gibt es
sechs kuratierte Recipes für zwei Protokolle, und alle Conditions hängen an
Zeit, Token-Balance oder dem Wick-&-Wait-Muster. Eine **preisbasierte Condition
gibt es nicht** — genau die ist die Voraussetzung für die drei Steps, die
Power-User als Erstes erwarten.

**Inhalt**
- Preisbasierte Condition als Grundlage (fehlt heute vollständig)
- Darauf aufbauend: Stop-Loss, Grid, Limit Order
- Editor auf das neue Design-System heben
- Fehlerzustände als vollwertige Ansichten statt als Toasts
- Erklärung im Editor, was ein Step tut, bevor man ihn setzt

**Fertig wenn:** Die neuen Steps sind kuratiert, im Editor bedienbar und im
Fork durchgestochen.

**Hängt an:** M1 (neue Steps müssen durch die Curated Registry).

---

## M6 — Multichain (erst EVM)

**Ziel:** Eine zweite EVM-Chain läuft vollständig — Vaults, Automationen,
Cockpit, Indexer.

Das Datenmodell führt `chainId` bereits pro Vault. Die Bindung an BSC steckt an
anderen Stellen: Die Preis-Abfrage hängt fest am Präfix `bsc:`, die
Protokoll-Registries sind auf PancakeSwap und Aave zugeschnitten, Indexer und
Keeper kennen genau eine Chain. Welche zweite Chain es wird, ist offen.

**Inhalt**
- Chain-Auswahl treffen und begründen
- Preis-Quelle chain-fähig machen
- Deploy-Kette für eine zweite Chain (Contracts, Registries, Katalog-Seed)
- Indexer und Keeper pro Chain betreiben
- Chain-Wechsel in der Oberfläche, Positionen über Chains hinweg im Cockpit

**Fertig wenn:** Ein Nutzer legt auf der zweiten Chain einen Vault an, deployt
eine Automation, sie wird ausgeführt und erscheint im gemeinsamen Cockpit.

**Hängt an:** M2 (der Indexer wird chain-fähig, das betrifft die Meldewege).

---

## M7 — KI-Copilot im Web

**Ziel:** „Strategien mit KI erstellen" wird für jeden Nutzer erreichbar, nicht
nur am Entwickler-Rechner.

Der schwierige Teil ist gebaut: Propose, Confirm, Deploy — mit einem
Confirm-Gate, das der Copilot nicht umgehen kann. Es fehlt der Weg vom lokalen
Werkzeug in die Web-Oberfläche. Das Gate bleibt dabei unangetastet: Auch der
Copilot bringt keine Signatur ohne ausdrückliche Zustimmung zustande.

**Inhalt**
- Gehosteter Copilot statt lokalem Prozess
- Copilot-Panel in der Oberfläche, überall andockbar
- Erklärungen zu Positionen und Executions in Klartext
- Belegt: identisches Confirm-Gate, kein zweiter Weg an den Regeln vorbei

**Fertig wenn:** Ein angemeldeter Nutzer beschreibt sein Ziel in einem Satz,
bekommt einen prüfbaren Vorschlag und deployt ihn nach eigener Bestätigung —
ohne lokale Installation.

**Hängt an:** M1 (der Copilot muss die Schutzregeln erben), M5 (er schlägt aus
dem erweiterten Baukasten vor).

---

## M8 — Der einfache Weg

**Ziel:** Ein Einsteiger kommt ohne Kenntnis von Ticks und Health Factor zu
einer laufenden, abgesicherten Strategie.

Erst hier trägt das Fundament, an das ein Einsteiger sich lehnen soll:
Absicherung ist Standard, der Security-Review ist durch, Fehler melden sich von
selbst. Das ist der zugesagte Punkt „Einfache Bedienung" in voller Tiefe.

**Inhalt**
- Strategie-Galerie mit echtem, nachprüfbarem Track-Record — keine erfundenen Zahlen
- Wizard statt Graph: Token, Betrag, Risikoprofil, fertig
- Demo-Modus mit Papiergeld, gleiche Seiten wie im Ernstfall
- Simulation: „Was passiert bei −20 %?"
- Anmeldung per E-Mail oder Social-Login mit Embedded Wallet, weiterhin
  self-custody

**Fertig wenn:** Jemand ohne Wallet-Erfahrung startet auf der öffentlichen
Seite, probiert im Demo-Modus, meldet sich per E-Mail an und hat eine laufende
Strategie — ohne den Graph-Editor je zu öffnen.

**Hängt an:** M1, M2, Produktivgang-Gate.

---

## Was bewusst nicht drin ist

- **PEC-Burn:** Am 27.07.2026 hinter alles geschoben. Kein Bestandteil dieser Roadmap.
- **Plan-/Subscription-Tiers:** Ersetzt durch das Credits-Modell.
- **Fiat-Onramp:** Im Zielbild vorgesehen, aber nicht Teil dieser neun
  Meilensteine; die Zielgruppe hält bereits Krypto.
- **Externes Audit:** Geprüft wird intern. Ein externes Audit ist nicht geplant;
  käme es später dazu, wird es ein eigener Meilenstein.
- **Nicht-EVM-Chains:** „Erst EVM" heißt: nach M6 neu bewerten.

## Offene Entscheidungen

Diese Punkte blockieren jeweils ihren Meilenstein und brauchen eine
menschliche Entscheidung:

| Frage | Blockiert |
|---|---|
| Kanal für Alerts (E-Mail, Push, Telegram) | M2 |
| Endgültige Höhe der Management Fee | M3 |
| Zahlungsmittel und Preisvorteil der Credits, regulatorische Einordnung | M4 |
| Welche zweite Chain | M6 |

Entschieden am 04.09.2026: Sprachen der Oberfläche (DE/EN), interne statt
externe Prüfung.
