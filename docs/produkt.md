---
created: 2026-08-18
last_verified: 2026-08-18
status: in-arbeit
---

# Pecunity — Produkt-Grundlagen (Zielbild)

Verbindliche Antwort auf die drei Grundfragen: Welches Problem lösen wir, für wen,
und wie sieht der Lösungsweg aus Nutzersicht aus. Dieses Dokument beschreibt das
**Zielbild**, entwickelt aus dem heutigen Stand. Was davon schon gebaut ist, steht in
`docs/discovery/produkt-strategie/analyse.md`. Specs, Epics und Issues richten sich an
diesem Dokument aus; bei Widerspruch gewinnt dieses Dokument, bis es bewusst geändert
wird.

## 1. Welches Problem lösen wir?

**DeFi ist mächtig, aber zersplittert — es gibt keinen Ort, an dem es sich wie eine
Finanz-App anfühlt.**

Wer heute im DeFi-Space Vermögen arbeiten lassen will, springt zwischen Dutzenden
Protokollen, DApps, Dashboards und Wallets: hier die Liquiditätsposition, dort das
Lending, drüben der Swap, das Gesamtbild nirgends. Was Trade Republic oder Robinhood
für klassische Anlagen geschaffen haben — ein Ort für Überblick, Handeln, Strategie
und Entdecken — existiert für DeFi nicht.

Hinter der Zersplitterung liegen vier Schmerzen, die sich gegenseitig verstärken:

1. **Handarbeit und ständige Aufmerksamkeit.** Wirksame Strategien —
   Liquiditäts-Ranges nachziehen, Erträge reinvestieren, Lending-Positionen im Blick
   behalten — verlangen einen Markt, der 24/7 läuft, und einen Nutzer, der es auch
   tut. *(Der Gründungs-Schmerz: genau diese drei Dinge automatisiert laufen zu
   lassen, ohne dass es dafür ein Werkzeug gab.)*
2. **Kontrollabgabe als Preis der Bequemlichkeit.** Die bequemen Auswege —
   CeFi-Earn-Produkte, verwahrende Yield-Aggregatoren — nehmen dem Nutzer die Arbeit
   ab, aber auch die Gelder aus der Hand: Gegenparteirisiko statt Selbstbestimmung,
   fremde Strategie statt eigener.
3. **Komplexität und Fehlerrisiko.** Ticks, Health-Factor, Slippage, Gas — ein
   falscher Parameter kann den Einsatz kosten. Die Hürde schließt viele aus, die
   längst Krypto halten.
4. **Fehlende Absicherung.** Wo etwas unbeaufsichtigt läuft, gibt es heute keine
   eingebauten Schutzmechanismen — kein Stop-Loss als Standard, keine Verlustgrenzen,
   keine Wächter.

**Unsere Lösung in einem Satz:** Pecunity bündelt DeFi in einer App mit dem
Bedienkomfort eines modernen Brokers — Portfolio-Überblick, Strategien bauen und
automatisieren, Ein- und Ausstieg, Markt-Discovery an einem Ort — selbstverwahrt und
mit Absicherung als Standard.

## 2. Für wen lösen wir das Problem?

Eine App, zwei Nutzergruppen. Beide gehören zum Zielbild; keine wird der anderen
geopfert. Der Unterschied liegt nicht im Produkt, sondern im Weg hindurch: ein
einfacher Standard-Weg und ein Experten-Modus.

### Der Einsteiger/Intermediate — der einfache Standard-Weg

Hält bereits Krypto (auf einer Börse oder in der eigenen Wallet), will sein Vermögen
arbeiten lassen und scheut die DeFi-Komplexität. Für ihn ist Pecunity die Finanz-App:
verständliche Strategien statt Ticks, Absicherung ohne Zutun aktiv, das Gesamtbild
auf einen Blick — das Trade-Republic-Gefühl für DeFi.

### Der Power-User — der Experten-Modus

Kennt Ticks, Health-Factor und Slot-Semantik; betreibt Strategien heute per Hand oder
mit Bastellösungen. Für ihn zählen Präzision und Tiefe: Strategien frei komponieren
(Graph-Editor), eigene Bausteine, bewusste Opt-outs. Komfort ist Bonus — Kontrolle
und Mächtigkeit sind Pflicht.

### Was beide auszeichnet

- **Hält bereits Krypto** — das Vermögen ist in Coins/Stablecoins; Fiat-Onboarding
  ist nicht das Kernproblem.
- **Self-Custody-affin** — hat oder akzeptiert eine eigene Wallet; Kontrollabgabe ist
  für ihn ein Ausschlusskriterium, kein Komfortmerkmal.
- **Renditeorientiert, nicht spekulativ** — will Vermögen arbeiten lassen (Yield,
  Zinseszins), nicht primär traden oder zocken.
- **Wenig Zeit** — der Anspruch ist „einrichten und laufen lassen", nicht tägliche
  Positionspflege.

### Reihenfolge: Power-User zuerst

Der Power-User ist der Startpunkt (Beachhead): Er ist bereits da, testet ehrlich und
bringt Volumen. Das Einsteiger-Erlebnis wird gebaut, sobald das Fundament trägt, an
das Einsteiger sich lehnen (Absicherung, Audit, Vertrauen). Diese Reihenfolge wurde
am 2026-07-27 entschieden und gilt weiter.

### Für wen nicht

- Nutzer, die Verwahrung bewusst abgeben wollen („kümmert euch komplett") — das
  bedienen zentrale Anbieter; Self-Custody ist bei Pecunity nicht verhandelbar.
- Reine Hochrisiko-Spekulation — das Versprechen ist „Vermögen arbeiten lassen, mit
  Absicherung", nicht „maximaler Hebel".

## 3. Wie sieht der Lösungsweg aus? (Nutzer-Journey)

Neun Stationen, vom ersten Kontakt bis zum laufenden Betrieb. Quer durch alle
Stationen: der **KI-Copilot** — überall verfügbar, erklärt Positionen, schlägt
Strategien vor, hilft beim Anpassen; und jede Aktion, die er anstößt, läuft durch
dasselbe Confirm-Gate wie alles andere.

### Station 1 — Entdecken, ohne Anmeldung

Das erste Erlebnis ist eine öffentliche Discovery-Seite, kein Login-Formular:
- **Strategie-Galerie mit Track-Record**: kuratierte Strategien mit echter,
  nachprüfbarer Performance und Risiko-Label.
- **Märkte & Renditen**: Assets, Pools und Zinssätze im Überblick — wie Kurslisten
  beim Broker.

Das Schaufenster verkauft nicht mit Versprechen, sondern mit nachprüfbaren Zahlen.

### Station 2 — Risikofrei ausprobieren

Bevor echtes Geld fließt, ist die App voll erlebbar: ein **Demo-Modus** mit
Papiergeld, in dem Strategien angelegt und beobachtet werden können, und eine
**Simulation**, die für jede Strategie zeigt, was bei Marktbewegungen passiert
(„was passiert bei −20 %?").

### Station 3 — Ankommen: Anmelden und Einzahlen

Zwei Türen, ein Ergebnis (immer self-custody):
- **Wallet verbinden** (Power-User-Weg): eigene Wallet, Sign-In per Signatur.
- **E-Mail/Social-Login** (Einsteiger-Weg): mit integrierter selbstverwahrter Wallet
  (Embedded Wallet) — die Hürde sinkt, die Kontrolle bleibt beim Nutzer.

Eingezahlt wird aus der Wallet oder von der Börse — und im Zielbild auch direkt per
**Fiat-Onramp** (Überweisung/Karte).

### Station 4 — Strategie wählen oder bauen

Drei Wege, ein Ergebnis:
- **Galerie** (Standard-Weg): Strategie aus dem Schaufenster übernehmen — Token,
  Betrag, Risikoprofil, fertig.
- **KI-Copilot**: das Ziel in eigenen Worten beschreiben; der Copilot schlägt den
  passenden Aufbau vor.
- **Graph-Editor** (Experten-Modus): Strategien frei aus Bausteinen komponieren —
  schema-getrieben, mit Validierung, die On-Chain-Fehler vorwegnimmt.

### Station 5 — Absicherung ist der Standard

Bevor irgendetwas läuft, greifen die Schutzschichten — ohne dass der Nutzer sie
konfigurieren muss:
- **Kuratierte Whitelist**: Automationen nutzen nur geprüfte Bausteine; Experten
  können bewusst opt-outen.
- **Slippage-Schutz** in jedem Tausch.
- **Schutz-Bausteine** als normale Steps: Stop-Loss, Health-Factor-Wächter,
  Max-Verlust-Grenze, Panik-Withdraw.

### Station 6 — Bestätigen und starten

Der eigene Vault entsteht: ein Smart Contract, den nur der Nutzer kontrolliert
(permissionless Factory, kein Admin-Zugriff des Anbieters auf Gelder). Jede Aktion,
die Vollmachten erteilt oder Gelder bewegt, wird einzeln und unfälschbar bestätigt
(server-erzwungenes Confirm-Gate — auch beim KI-Copiloten). Deploy erfolgt
zweiphasig: erst prüfbar vorschlagen, dann bestätigt ausführen.

### Station 7 — Läuft von allein, aber nur nach Regeln

Keeper führen die Automation aus — aber nur, wenn der hinterlegte Auslöser
**on-chain nachweisbar erfüllt** ist. Der Keeper kann nichts anderes tun als das,
was der Nutzer deployt hat; sein Gas wird aus einem vorfinanzierten Depot
kompensiert. Zuständigkeit und Verhalten bei Ausfall sind definiert — „läuft von
allein" ist ein Versprechen, kein Zufall.

### Station 8 — Überblick behalten, ohne hinzusehen

Das Cockpit zeigt jederzeit das Gesamtbild: USD-Bewertung über alle Protokolle,
Netto-Equity, Wertverlauf, fairer (flow-adjustierter) PnL, einheitliche Historie
jeder Ausführung. Und die App meldet sich von selbst, wenn es darauf ankommt:
Ausführung fehlgeschlagen, Health-Factor kritisch, Gas-Depot fast leer. Stille
bedeutet nachweisbar „alles in Ordnung", nicht „niemand hat hingeschaut". Der
Copilot erklärt auf Nachfrage jede Position und jede Ausführung in Klartext.

### Station 9 — Fair bezahlen

Zwei Schienen, eine Berechnungsquelle:
- **Credits** (off-chain): Nutzer kauft Guthaben; On-Chain-Gebühren werden auf 0
  gestellt und transparent gegen das Guthaben abgerechnet.
- **On-chain** (ohne Credits): Gebühren laufen normal über die Contracts.

Kern der Fairness: Die Performance-Gebühr greift nur über der High-Water-Mark —
also nur bei echtem, neuem Gewinn. Beide Schienen rechnen aus derselben Quelle,
und der Nutzer sieht jederzeit, wofür er zahlt.

## Leitplanken (nicht verhandelbar)

1. **Self-Custody immer**: kein Feature rechtfertigt Zugriff des Anbieters auf
   Gelder — auch die Embedded Wallet ist selbstverwahrt.
2. **Absicherung ist Default, Risiko ist Opt-in** — nie umgekehrt.
3. **Keine Signatur ohne explizite Zustimmung** des Nutzers, auch nicht durch die KI.
4. **Ehrliche Rückmeldung**: Fehlschläge werden gemeldet, nie verschluckt.
5. **Eine Quelle für Gebühren-Logik** on-chain und off-chain (Drift-Verbot, analog
   Encode-Boundary-Prinzip).

## Verweise

- Ist-Stand, Gap-Analyse, Roadmap, Monetarisierungs-Entscheidungen:
  `docs/discovery/produkt-strategie/analyse.md`
- Fachliche Verträge der gebauten Bereiche: Reverse-Specs unter `docs/discovery/`
- Nächstes Arbeitspaket: `docs/prd/absicherungs-paket.md`
