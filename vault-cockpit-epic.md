# Epic: Vault-Cockpit — DeFi-Positionen, Werthistorie & Performance auf einen Blick

## Beschreibung

Vault-Owner führen über Strategy Builder V2 reale DeFi-Automationen aus (Aave V3, PancakeSwap V3), haben heute aber **keine konsolidierte Sicht** auf das Ergebnis: Was steckt aktuell in welcher Position, wie hat sich der Vault-Wert entwickelt, und verdient die Strategie tatsächlich Geld? Dieses Epic baut auf der Vault-Detailseite ein **Read-only-Cockpit** für den eingeloggten Owner: detaillierte DeFi-Positionen inkl. Earnings, ein USD-Wertverlauf über die Zeit und eine Performance-/PnL-Ansicht gegenüber den Einzahlungen — von Beginn an so strukturiert, dass künftige Protokolle (mit neuen Step-Nodes) ohne Neukonzeption in dieselben Ansichten einfließen.

## Problemdefinition

**Welches Kundenproblem lösen wir?**
Der Owner sieht heute nur rohe Token-Bestände bzw. Ausführungs-Historie, aber nicht das wirtschaftliche Gesamtbild seines Vaults: keine aufbereiteten Positionen (Health Factor, LP-Range, unclaimed Fees), keinen USD-Wertverlauf und keinen echten Ertrag (PnL gegenüber Einzahlungen). Um diese Fragen zu beantworten, muss er Block-Explorer und Drittseiten bemühen — mühsam, fehleranfällig und vertrauensmindernd.

**Für wen lösen wir dieses Problem?**
Für den **eingeloggten Vault-Owner**, der einen Vault erstellt und Automationen über Aave V3 / PancakeSwap V3 deployed hat und sein eingesetztes Kapital aktiv überwacht.

## Ergebnisziele

1. **Vollständige Positions-Transparenz:** Owner sehen 100 % ihrer aktiven Aave-V3- und PancakeSwap-V3-Positionen mit USD-Wert, protokollspezifischen Kennzahlen und Earnings — ohne externe Tools.
2. **Nachvollziehbare Wertentwicklung:** Owner können den USD-Wertverlauf ihres Vaults für definierte Zeiträume (24 h / 7 T / 30 T / Seit Erstellung) einsehen.
3. **Echte Ertragsmessung:** Owner sehen ihren PnL gegenüber netto eingezahltem Kapital — absolut (USD) und prozentual, aktuell und historisch.
4. **Zukunftssicherheit:** Ein neu angebundenes Protokoll erscheint in Positionen, Wertverlauf und Performance, ohne dass diese Ansichten neu konzipiert werden müssen.

## Hypothesen

1. **Hypothese 1:** Wenn Owner Risiko (Health Factor) und Ertrag (Earnings/PnL) konsolidiert sehen, **vertrauen** sie der Plattform stärker und **deployen mehr Kapital / mehr Automationen**.
2. **Hypothese 2:** Eine vollständige In-App-Übersicht **reduziert die Nutzung von Block-Explorern/Support**, weil die relevanten Fragen direkt in der App beantwortet werden.
3. **Hypothese 3:** Eine aussagekräftige Performance-Sicht **erhöht die Wiederkehr-Rate** (Owner kommen regelmäßig zurück, um „nach ihrem Geld zu sehen").

## Discovery-Plan

- **One Pager — Wonder & Explore:** _[Platzhalter — Link einfügen]_
- **Live Feature Document — Make & Impact:** _[Platzhalter — Link einfügen]_
- **Vorarbeit (Story-Refinement):** 4 User Stories liegen vor (Positionen-Detail, USD-Wertverlauf, Performance/PnL, Protokoll-Erweiterbarkeit).

## Team und Verantwortlichkeiten

| Rolle | Person |
|-------|--------|
| Produktmanager | _[Platzhalter]_ |
| Designer | _[Platzhalter]_ |
| Entwickler (Frontend) | _[Platzhalter]_ |
| Entwickler (Backend/Indexer) | _[Platzhalter]_ |
| QA | _[Platzhalter]_ |
| Weitere Rollen | _[Platzhalter]_ |

## Erfolgskriterien

1. **Engagement / Retention:** Messbarer Anstieg der wiederkehrenden Besuche der Vault-Detailseite pro aktivem Owner (Baseline vor Launch → Ziel nach Launch festlegen).
2. **Weniger Support/Explorer:** Rückgang der Support-Anfragen zu „Wo sehe ich meine Position / meinen Ertrag?" und/oder messbar geringere Abwanderung in externe Explorer (z. B. via Outbound-Link-Tracking).
3. **Mehr eingesetztes Kapital:** Anstieg des durchschnittlich pro Vault deployten Kapitals / der Anzahl aktiver DeFi-Automationen nach Launch.
4. **Adoption der neuen Ansicht:** Anteil aktiver Owner, die Positions-/Performance-Ansicht innerhalb von 30 Tagen nach Launch mindestens einmal nutzen.

> Konkrete Zielwerte (z. B. „+20 % Wiederkehr") sind im Refinement mit Baseline-Daten zu fixieren.

## Stakeholder

- **Hauptstakeholder:** Product Owner / Gründung (3Blocks), Engineering-Lead, Design-Lead, ausgewählte Power-User-Owner (Beta-Feedback)
- **Kommunikationsplan:** Demo + Statusupdate nach jeder fertiggestellten Story; Beta-Vorschau der Performance-Ansicht an Power-User vor breitem Rollout; Erfolgskriterien-Review 30 Tage nach Launch.

## Abgrenzung (Out of Scope)

- **Keine Schreib-Aktionen:** Reine Read-only-Übersicht — kein Schließen/Anpassen von Positionen aus dieser Ansicht (bleibt Sache der Automationen).
- **Keine Multi-Vault-Aggregation:** Nur pro einzelnem Vault — keine portfolioübergreifende Sicht über mehrere Vaults eines Owners.
- **Kein Steuer-/Reporting-Export:** Keine CSV-/Steuer-Reports oder Buchhaltungs-Exporte.
- **Keine öffentliche Sicht:** Ansichten bleiben auf den eingeloggten Owner beschränkt — kein Read-only-Sharing für Nicht-Owner.

## Risikobewertung

### Zuverlässigkeit (Reliability)

**Risiko:** Falsche oder veraltete Werte (USD-Preis, Health Factor, unclaimed Fees) untergraben das Vertrauen sofort — gerade bei Geld. Oracle-/RPC-Ausfälle oder Indexer-Lag (vgl. bekannte Fork-Confirmation-Lag-Problematik) können zu „leeren" oder eingefrorenen Ansichten führen.

**Maßnahmen zur Minderung:**
- Sichtbarer Datenstand („aktualisiert vor X Sek.") + Freshness-Indikator statt stiller Veralterung
- Klare Leer-/Fehlerzustände statt irreführender 0-/∞-Werte (besonders frischer Vault, kein Kapital)
- Monitoring der Daten-Pipeline (Indexer-Cursor-Freshness, Preisquellen-Fallback wie heute DeFiLlama)

### Skalierbarkeit (Scalability)

**Risiko:** Historische USD-Zeitreihen und Per-Position-Berechnungen über viele Vaults/Protokolle hinweg können Datenmenge und On-Chain-Reads stark erhöhen.

**Maßnahmen zur Minderung:**
- Wiederverwendung der bestehenden Indexer-Architektur als gemeinsame Datengrundlage (Snapshots statt Live-Vollscan je Aufruf)
- Caching der Portfolio-/Preis-Werte (analog vorhandener 60 s/1 h-Caches)
- Erweiterbares Datenmodell, das neue Protokolle aufnimmt, ohne pro Protokoll neue Query-Pfade in der UI

### Leistung (Performance)

**Risiko:** Aggregation vieler Positionen + Zeitreihen-Charts kann die Vault-Detailseite spürbar verlangsamen.

**Maßnahmen zur Minderung:**
- Vorberechnete/aggregierte USD-Snapshots statt On-the-fly-Berechnung beim Seitenaufruf
- Lazy-Loading / getrennte Ladepfade für Positionen, Chart und PnL
- Definierte Zeitraum-Granularitäten, um Datenpunkte je Chart zu begrenzen

### Wartbarkeit (Maintainability)

**Risiko:** Wenn jede Protokoll-Integration (neue Step-Node) Sonderlogik in Positionen/Performance erzwingt, wächst die Komplexität unkontrolliert (Kern von Story 4).

**Maßnahmen zur Minderung:**
- Ein einheitliches, protokoll-agnostisches Positions-/Bewertungsschema; Protokolle docken über einen klaren Adapter/Leitfaden an
- Dokumentierter „So bindest du ein neues Protokoll an"-Leitfaden
- Regressionsschutz: bestehende Aave-/PCS-Ansichten bleiben bei Erweiterung unverändert grün

## Anpassungsstrategie

- **Überprüfungspunkte:** Nach jeder fertiggestellten Story (Demo + Datenabgleich gegen On-Chain-Realität); Erfolgskriterien-Review 30 Tage nach Launch.
- **Anpassungskriterien:** Story 1 bei zu großem Umfang in „Positionen + Kennzahlen" und „Earnings/APY" splitten; Story 4 nicht auf Vorrat bauen, sondern an die erste echte Protokoll-Erweiterung koppeln; gemeinsame USD-Zeitreihe ggf. als vorgezogene technische Vorarbeit ziehen, falls Stories 2 & 3 sonst blockieren.

---

## Zugehörige User Stories

1. **DeFi-Positionen meines Vaults im Detail einsehen** — Aave V3 / PancakeSwap V3 Positionen mit protokollspezifischen Kennzahlen (Health Factor, LP-Range, unclaimed Fees) + Earnings/APY.
2. **Den USD-Wertverlauf meines Vaults über die Zeit sehen** — Verlaufskurve des Vault-Gesamtwerts in USD, Zeiträume 24 h / 7 T / 30 T / Seit Erstellung, Ein-/Auszahlungs-Marker.
3. **Die Performance meines Vaults gegenüber meinen Einzahlungen sehen** — PnL absolut (USD) + prozentual, aktuell und historisch, gegen netto eingezahltes Kapital.
4. **Neue Protokolle erscheinen automatisch in Positionen & Performance** — Erweiterbarkeit, sodass neue Step-Node-Protokolle ohne Neukonzeption in alle Ansichten einfließen.

## Offene Punkte (vor Refinement-Ready)

1. **Konkrete Zielwerte** für die Erfolgskriterien festlegen (brauchen Baseline, z. B. „+20 % Wiederkehr in 90 Tagen").
2. **Abhängigkeit „gemeinsame USD-Zeitreihe"** (Stories 2 & 3): als eigene technische Vorarbeit einplanen?
