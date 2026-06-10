# Epic: Pecunity MCP-Server — DeFi-Vaults per KI-Assistent steuern

> **Quelle:** User Stories unter `docs/user-stories/mcp-integration.md` (7 Stories, Abhängigkeitskette).
> Vorbild/Inspiration: n8n „MCP Server Trigger" (siehe `docs/research-n8n-comparison.md`).

### Beschreibung

Wir machen das Pecunity-Automatisierungsprotokoll über einen **Pecunity MCP-Server** für
KI-Assistenten wie Claude Desktop steuerbar. Ein Nutzer verbindet seine Wallet mit dem MCP-Server,
authentifiziert sich als Vault-Owner, und kann anschließend seine Vaults und Automations per
natürlicher Sprache **einsehen, bauen, deployen und verwalten** — inklusive Geldbewegung. Der
MCP-Server signiert dabei selbst (Wallet-Zugang in der Konfiguration).

Strategisch ist das der „n8n-für-die-Blockchain"-Hebel: n8n exponiert Workflows als AI-Tools, wir
exponieren On-Chain-Bausteine — mit dem strukturellen Vorsprung, dass unser `paramSchema` bereits
JSON-Schema (MCP-natives Tool-Format) ist und die validierende **Encode-Boundary**
(`mapGraphToRaw` + `validateParams(mode:'raw')` + Raw-Mode-Guards) fehlerhaften KI-Output abfängt,
bevor irgendetwas on-chain geht. Der Self-Custody-USP des Protokolls darf durch die Integration
nicht untergraben werden — deshalb sind Schutzmechanismen (Bestätigung, Limits, Simulation, Audit)
ein Pflicht-Bestandteil, kein Anhang.

### Problemdefinition

**Welches Kundenproblem lösen wir?**
On-Chain-Strategien zu erstellen und zu betreiben erfordert heute, die Web-UI mit ihrem
Graph-Editor zu bedienen, Bausteine (Conditions/Actions) und ihre Parameter zu verstehen sowie jede
Transaktion manuell in der Wallet zu signieren. Das ist für Einsteiger eine hohe Einstiegshürde und
für erfahrene Nutzer ein wiederkehrender Medienbruch (App wechseln, Editor bedienen, einzeln
bestätigen). Es gibt keinen Weg, eine Strategie einfach **in Worten** zu beschreiben und sie
sicher umsetzen zu lassen — obwohl unser Deskriptor (`paramSchema`) und unsere validierende
Encode-Boundary die idealen Bausteine dafür bereits liefern.

**Für wen lösen wir dieses Problem?**
Gleichgewichtig für zwei Segmente:
- **Bestehende Power-User / Vault-Betreiber** — kennen den Editor, suchen Geschwindigkeit und
  Komfort, wollen ihre Vaults im Chat-Kontext überblicken und steuern, ohne die App zu wechseln.
- **Neue, nicht-technische Nutzer** — wollen oder können den Graph-Editor nicht bedienen und
  möchten Strategien (z. B. „kaufe wöchentlich für 50 USDT WBNB", „schütze meinen Health-Factor")
  rein sprachlich aufsetzen. Für sie ist das Schutzbedürfnis am höchsten, da sie die On-Chain-
  Mechanik weniger durchschauen.

### Ergebnisziele

1. **Ziel 1 — Vollständiger Lebenszyklus per MCP:** Ein verbundener Nutzer kann ohne Web-UI Vaults
   erstellen, Automations bauen+deployen, ein-/auszahlen und Automations aktivieren/deaktivieren.
2. **Ziel 2 — KI-Building als Kern:** Ein Nutzer kann eine Strategie in natürlicher Sprache
   beschreiben und erhält daraus eine gültige, on-chain deploybare Automation (MVP: kuratierte
   Strategie-Muster).
3. **Ziel 3 — Self-Custody-treue Sicherheit:** Keine schreibende/geldbewegende Aktion ohne
   serverseitig erzwungene Bestätigung und Limits; vollständiges Audit-Log; Read-only-Modus
   verfügbar.
4. **Ziel 4 — Owner-Isolation:** Der Agent operiert ausschließlich auf den Vaults der verbundenen
   Wallet; kein Zugriff auf fremde Vaults, kein Key-Leak in Logs oder LLM-Ausgaben.

### Hypothesen

1. **Hypothese 1:** Nutzer (beide Segmente) ziehen das Beschreiben einer Strategie in natürlicher
   Sprache dem manuellen Graph-Editor vor — gemessen an einer sinkenden Time-to-first-automation
   und einem signifikanten Anteil über MCP erstellter Automations.
2. **Hypothese 2:** Unsere bestehende Encode-Boundary fängt fehlerhaften KI-Output zuverlässig ab,
   sodass KI-generierte Graphen mit hoher Erfolgsrate gültig sind und kein ungültiger Graph
   on-chain landet.
3. **Hypothese 3:** Nutzer akzeptieren einen Signing-fähigen MCP-Server, *wenn* Bestätigung, Limits
   und ein Audit-Log spürbar Kontrolle vermitteln — Sicherheit ist Adoption-Treiber, nicht -Bremse.
4. **Hypothese 4:** Der MVP mit wenigen kuratierten Strategie-Mustern (DCA, Stop-Loss, HF-Schutz)
   deckt den Großteil der initial nachgefragten Anwendungsfälle ab.

### Discovery-Plan

- **One Pager — Wonder & Explore:** [Link einfügen]
- **Live Feature Document — Make & Impact:** [Link einfügen]
- **Research-Grundlage:** `docs/research-n8n-comparison.md` (n8n-Vergleich, AI-Plan, Backlog)
- **User Stories:** `docs/user-stories/mcp-integration.md` (7 Stories inkl. INVEST + DoD)

### Team und Verantwortlichkeiten

| Rolle | Person |
|-------|--------|
| Produktmanager | [Name] |
| Designer | [Name] |
| Entwickler (Backend/MCP) | [Name] |
| Entwickler (Smart Contracts / Signing) | [Name] |
| QA | [Name] |
| Security-Review | [Name] |
| Weitere Rollen | [Name] |

### Erfolgskriterien

1. **Adoption:** Anzahl **aktiver MCP-Nutzer** (Wallet verbunden + mind. eine Aktion über MCP
   ausgeführt) pro Zeitraum.
2. **KI-Building-Volumen:** Anzahl erfolgreich **deployter Automations, die über den
   KI-Assistenten (Story 5) gebaut** wurden.
3. **Time-to-first-automation:** Mediane Zeit von Wallet-Verbindung bis zur ersten **feuernden**
   Automation (Vergleich MCP-Pfad vs. Editor-Pfad).
4. **Erfolgsrate KI-Graphen:** Anteil KI-generierter Graphen, die die Encode-Boundary bestehen bzw.
   on-chain feuern (vs. abgelehnt) — Zielwert hoch, kein ungültiger Graph on-chain.

> Begleitende Guardrail-Metrik (nicht primär): **0** Vorfälle von Key-Leak oder Zugriff auf fremde
> Vaults; **0** schreibende Aktionen ohne erzwungene Bestätigung.

### Stakeholder

- **Hauptstakeholder:** [Produkt-Lead], [Security/Risk-Owner], [Engineering-Lead]
- **Weitere:** [Compliance/Legal — wegen Custody/Signing], [Community/DevRel — Setup-Doku &
  Adoption]
- **Kommunikationsplan:** Statusupdate pro abgeschlossener Story/Slice der Abhängigkeitskette;
  dedizierter Security-Review-Termin vor Auslieferung jeder schreibenden/geldbewegenden Story
  (Stories 4, 5, 6) und der Schutzmechanismen (Story 7).

### Risikobewertung

#### Zuverlässigkeit (Reliability)

**Risiko:** Ein KI-Agent mit Signing-Vollmacht kann durch Fehlinterpretation einer Anweisung oder
durch **Prompt-Injection** echtes Vermögen bewegen; fehlgeschlagene/abgebrochene Transaktionen
könnten zu inkonsistentem Nutzerverständnis führen.

**Maßnahmen zur Minderung:**
- Serverseitig erzwungene Bestätigung **vor jeder** schreibenden/geldbewegenden Aktion (Story 7),
  nicht per LLM-Konvention umgehbar.
- Konfigurierbare Limits (Max-Betrag pro Aktion/Zeitraum) und Read-only-Modus.
- Dekodierte, verständliche Fehlermeldungen (bestehender `ContractErrorService.decodeRevert`) statt
  roher Reverts; kein stiller Teilerfolg.
- Prompt-Injection-Szenario als Pflicht-Testfall im Security-Review.

#### Skalierbarkeit (Scalability)

**Risiko:** Bei wachsender Nutzerzahl kann der MCP-Server (insb. im gehosteten Modell) zum Engpass
werden; das Signing-Modell beeinflusst die Skalierungsarchitektur erheblich (zentraler Key-Honeypot
vs. verteiltes lokales Signing).

**Maßnahmen zur Minderung:**
- Deployment-Modell früh entscheiden (siehe „Offene Entscheidungen" in den Stories) — Empfehlung
  **lokal (stdio)**, was Last verteilt und keinen zentralen Honeypot schafft.
- Read-Tools auf bestehende, bereits gecachte Backend-Endpunkte stützen (Portfolio 60s, Fees 1h),
  statt neue Hot-Paths zu erzeugen.
- Bei gehostetem Modell: horizontale Skalierung der MCP-Schicht und Trennung von Signing-Pfad.

#### Leistung (Performance)

**Risiko:** Langsame Antwortzeiten beim Tool-Aufruf (Katalog, Lese-Abfragen, Encode/Simulate)
verschlechtern das Chat-Erlebnis und verlängern die Time-to-first-automation.

**Maßnahmen zur Minderung:**
- Tool-Katalog (Story 3) aus statisch generierbarem `paramSchema`/`abiFragment` bedienen
  (vorhandenes `/step-types`), nicht pro Aufruf neu berechnen.
- Simulate/Dry-run (Story 7) gegen Fork/Read-Pfad, ohne unnötige On-Chain-Roundtrips.
- Performance-Benchmark der Lese- und Encode-Tools als wiederkehrende Messung.

#### Wartbarkeit (Maintainability)

**Risiko:** Eine zweite Schnittstelle (MCP) neben der Web-UI kann zu Logik-Duplikat und Drift
führen (z. B. eigene Encode-/Validierungslogik), zumal Redeploys ohnehin „drifted automations"
verursachen können.

**Maßnahmen zur Minderung:**
- MCP-Tools konsequent auf **denselben** Backend-Pfaden aufsetzen wie die Web-UI (Encode-Boundary,
  Validierung, Indexer) — keine parallele Zweitimplementierung.
- Tool-Katalog aus der **einzigen Quelle** `StepType`/`paramSchema` speisen, damit neue Bausteine
  ohne MCP-Codeänderung erscheinen.
- Setup-/Betriebsdokumentation (Claude-Desktop-Config, Wallet-Zugang, Verbindung trennen) als Teil
  der DoD von Story 1.

### Anpassungsstrategie

- **Überprüfungspunkte:** Nach **jeder abgeschlossenen Story/Slice** der Abhängigkeitskette
  (Story 1 → 2/3/4/7 → 5/6). Vor Auslieferung jeder schreibenden Story (4, 5, 6) zwingend ein
  Security-Review-Gate.
- **Anpassungskriterien:**
  - Erfolgsrate KI-Graphen zu niedrig → Story 5 enger auf kuratierte Muster begrenzen, Katalog-
    Metadaten (Story 3) anreichern.
  - Time-to-first-automation oder Adoption hinter Erwartung → Setup-Reibung (Story 1) und
    Bestätigungs-UX (Story 7) überprüfen.
  - Sicherheits-/Custody-Bedenken (Stakeholder/Compliance) → Deployment-Modell und Wallet-Zugangs-
    Mechanismus neu bewerten, ggf. signierenden Modus hinter zusätzliche Freigaben legen.

---

## Scope-Abgrenzung

**In Scope (MVP):**
- Wallet verbinden & authentifizieren (Self-Signing-Server)
- Lesen/Discovery (Vaults, Portfolio, Automations, Ausführungsverlauf)
- KI-lesbarer Aktions-Katalog
- Vault erstellen, Automation aus Sprache bauen+deployen (kuratierte Muster), Geld bewegen,
  Lifecycle verwalten
- Schutzmechanismen (Bestätigung, Limits, Simulation, Audit-Log, Read-only-Modus)

**Out of Scope (erste Iteration):**
- Multi-Wallet-/Team-Accounts
- Strategie-Marktplatz-Anbindung über MCP
- Community-/Third-Party-Tools (delegatecall-Sicherheitsrisiko)
- KI-Konsum **externer** MCP-Server (n8ns „MCP Client")
- Volles Freiform-AI-Building über die kuratierten Muster hinaus (spätere Erweiterung)

## Offene Entscheidungen (aus den Stories übernommen)

1. **Deployment-Modell** lokal (stdio) vs. gehostet — Empfehlung: lokal (Self-Custody-treu, kein
   zentraler Honeypot). Prägt Story 1 und die Skalierungsarchitektur.
2. **Wallet-Zugangs-Mechanismus** — roher Private Key (Doku-Beispiel) vs. verschlüsselter Keystore
   vs. externer Signer; sicherere Variante als Standard empfohlen.
3. **Umfang Freiform-AI-Building (Story 5)** — MVP auf 2–3 kuratierte Muster begrenzen (empfohlen).

## Getroffene Entscheidungen

1. **Custody:** Server signiert selbst (Private Key) — Story „Schutzmechanismen" dadurch Pflicht.
2. **Umfang:** voller Lebenszyklus inkl. Geldbewegung.
3. **AI-Building:** Kern des MVP (recipe-/musterbasiert in erster Iteration).
4. **Zielgruppe:** Power-User und nicht-technische Nutzer gleichgewichtig.
5. **Review-Kadenz:** pro Story/Slice, mit Security-Gate vor jeder schreibenden Story.
