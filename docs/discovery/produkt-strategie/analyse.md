---
created: 2026-07-27
last_verified: 2026-07-27
git_commit: d736591
---

# Produkt-Analyse: Pecunity — eigene Vaults, Absicherung, Automatisierung, Monetarisierung

> Grundlage: die 9 Reverse-Specs unter `docs/discovery/` (Ist-Stand aus Bestandscode),
> der Fee-Entwurf ENG-48 (Linear, als Referenz — Tracking läuft lokal) und die im
> Brownfield-Audit dokumentierten Lücken. Zahlen zu Markt/Wettbewerb stammen aus
> Trainingswissen, sind als **Annahme** markiert und nicht recherchiert (keine Websuche).
> Dieses Dokument ist Analyse-Vorstufe — die Entscheidungen daraus werden per Grilling
> bestätigt und dann als Epics geschnitten.

## A. Ist-Stand (was das Produkt heute kann)

Self-Custody-DeFi-Vaults auf BSC mit visuellem Automatisierungs-Baukasten und KI-Assistent:

- **Vault-Lifecycle:** permissionless Factory (CREATE2, ERC1967, nicht upgradebar), nur der
  Owner kontrolliert Gelder; Keeper führen Automationen nur bei on-chain erfülltem Trigger
  aus, Gas-Kompensation aus vorfinanziertem FeeRegistry-Depot.
- **Strategie-Bau:** Graph-Editor (schema-getrieben, max. 256 Steps, Validierung spiegelt
  On-Chain-Reverts), 3 kuratierte Recipes (Entry, Rebalance mit Wick&Wait/TWAP,
  Auto-Compound) für PancakeSwap V3 + Aave V3.
- **Cockpit:** USD-Bewertung (Preis-Kaskade), Netto-Equity über Protokolle, Wertverlauf,
  flow-adjustierter PnL, einheitliche Historie mit Live-Updates.
- **KI-Assistent (MCP):** Read-Tools frei, schreibende/signierende Aktionen hinter
  server-erzwungenem Confirm-Gate (PolicyGate), zweiphasiger Automation-Deploy.
- **Monetarisierung heute:** flache Deposit-/Withdraw-Fee (Fork-Config: 100/50 bps,
  hart ≤ 10 %) + Gas-Comp. Kein wiederkehrender Umsatz, keine Erfolgsbeteiligung, keine Pläne.

## B. Persona-Befund (die zentrale Spannung)

Das heutige Produkt bedient **DeFi-Power-User**: Wer den Graph-Editor nutzen will, muss
Ticks, Health-Factor, TWAP-Fenster und Slot-Semantik verstehen. Die Produktvision
(„User erstellen eigene Vaults, um sich **einfacher** im DeFi-Space zu bewegen, **mit
Absicherung**") zielt auf **ambitionierte Einsteiger/Intermediates** — dazwischen liegt die
größte Produkt-Lücke. Hypothese: Power-User sind der Beachhead (sie sind da, sie testen),
Einsteiger sind der Nordstern (sie skalieren TVL).

## C. Gap-Analyse — was fehlt für „eigener Vault, sicher, automatisiert" (Epic-Kandidaten)

### E1 — Template-First-Erstellung (Strategie-Galerie statt Graph-Zwang)
Recipes existieren als Roh-Graphen; es fehlt: Galerie mit Klartext-Beschreibung,
Risiko-Label, parametrisierter Wizard (Token, Betrag, Risikoprofil — 3 Felder statt
Graph), Graph-Editor wird „Experten-Modus". Größter Hebel für die Einsteiger-Persona.

### E2 — Absicherungs-Paket on-chain (Vertrauens-Voraussetzung)
Dokumentierte Lücken aus den Reverse-Specs:
1. **Kein Slippage-Schutz in v1-Swaps** (bewusst ausgeliefertes MVP-Risiko — vault-contracts-Spec).
2. **Keine Action-/Condition-Whitelist:** Owner kann beliebige delegatecall-Targets
   eintragen; eine bösartige Action kann den Vault-Storage inkl. Owner-Slot überschreiben
   (offene Härtungsfrage der Spec). Für „Einsteiger mit Absicherung" untragbar —
   kuratierte Registry als Default, Experten-Opt-out.
3. Schutz-Bausteine als Standard-Steps: Stop-Loss, HF-Wächter, Max-Verlust-Grenze,
   Panik-Withdraw.
4. Simulation/Preview vor Deploy („was passiert bei −20 % Preis?").

### E3 — Fee-System on-chain (= ENG-48, S1–S5)
Rabatt-Vektor (S1, Wurzel) → Performance-Fee 15 % über HWM (S2) → Base-Fee (S3) →
Free-Transactions (S4) → PEC-Burn (S5). Solide geschnitten, Abhängigkeiten klar.
Bewertung der Höhe: siehe D.

### E4 — Subscription/Pläne (Off-Chain-Gegenstück zu E3)
Plan-Verwaltung, Zahlung, Rabatt-Quellen (Plan/Referral/NFT/Loyalty) → speist den
S1-Vektor; Free-Tx-Kontingente (0/50/100/200/500 p.m.) inkl. Autorisierung des
„frei"-Markers (offener Punkt aus S4).

### E5 — Monitoring & Benachrichtigungen
Server kennt Ausführungen und Fehlschläge (Indexer, Keeper-Ingest) — der Nutzer erfährt
davon nur im Cockpit. Fehlt: E-Mail/Push/Telegram („Ausführung fehlgeschlagen",
„HF unter 1,2", „Gas-Depot fast leer"). Für unbeaufsichtigte Automationen essenziell.

### E6 — Vertrauens-Fundament
Externer Audit der Fee-/Vault-Pfade (ENG-48 nennt ihn selbst als Erfolgskriterium),
öffentlicher Track-Record (Strategie-Performance), Demo-/Testnet-Modus, Doku-Ausbau
(docs.octodefi.com). Ohne Audit keine seriöse Monetarisierung.

### E7 — KI-Assistent produktisieren (Differenzierer)
Der MCP-Flow (propose → confirm → deploy mit unfälschbarem Confirm-Gate) ist ein
Alleinstellungsmerkmal. Heute: lokales Power-User-Werkzeug. Kandidat: gehosteter
Assistent im Web-UI („beschreibe deine Strategie in einem Satz").

### E8 — Multi-Chain (später)
S5 (Stargate) deutet die Richtung an. Empfehlung: BSC-only bis Product-Market-Fit.

### E9 — Keeper-/Executor-Zuverlässigkeit
Wer führt aus, mit welcher SLA, was passiert bei Keeper-Ausfall? Voraussetzung für
das Nutzerversprechen „läuft von allein" und für S4 (Executor trägt Gas bei Free-Tx).

## D. Monetarisierung — Bewertung des Fee-Entwurfs

**Umsatz-Ströme im Modell:** flache Flow-Fees (existiert) · Performance-Fee 15 % über
HWM (S2) · Base-Fee 5 % p.a. auf eingezahltes Kapital (S3) · Pläne/Subscriptions (E4) ·
PEC-Burn als Tokenomics-Schwungrad (S5).

**Einschätzung pro Strom:**

| Strom | Einschätzung |
|---|---|
| Performance-Fee 15 % über HWM | **Marktüblich und fair** (Annahme: Markt 10–20 %; HWM-Mechanik = „nur bei echtem Gewinn" ist das richtige Signal). Stärkster, incentive-kompatibler Strom. |
| Base-Fee **5 % p.a. auf Prinzipal** | **Größtes Risiko im Modell.** Annahme: Markt-Management-Fees liegen bei 0–2 % p.a. (Yearn/Beefy-Klasse: 0 % mgmt + Perf-Anteil). 5 % auf eingezahltes Kapital — auch in Verlustphasen — ist 2,5–10× Markt und dürfte Churn treiben. Alternativen: (a) 1–2 % p.a., (b) Base-Fee nur als Teil bezahlter Pläne, (c) Umdeutung als „Automatisierungs-Gebühr" pro aktiver Automation statt auf idle Kapital. |
| Flow-Fees (Deposit 1 % / Withdraw 0,5 %) | Reibung am Ein-/Ausgang; Einstieg wird gern kostenlos erwartet (Annahme). Kandidat für Rabatt-Vektor/Pläne statt Standard. |
| Subscriptions + Free-Tx | Gut: planbarer Umsatz, klare Plan-Differenzierung über den Rabatt-Vektor (S1 als eine Stelle on-chain ist architektonisch stark). |
| PEC-Burn | Tokenomics-Hebel, aber regulatorisch/kommunikativ sensibel; technisch komplex (Bridge+Swap). Kein V1-Blocker. |

**Grobe Sensitivität (reine Rechen-Illustration, keine Prognose):** Bei 1.000 aktiven
Vaults à Ø 5.000 $ TVL (= 5 M$): Base-Fee 5 % → 250 k$/a; bei 1,5 % → 75 k$/a.
Performance-Fee bei Ø 10 % Jahresgewinn × 15 % → 75 k$/a. Subscriptions (Annahme
10 % zahlend à 20 $/m) → 24 k$/a. Kernaussage: **Die Modell-Tragfähigkeit hängt fast
vollständig an TVL-Wachstum** — und TVL-Wachstum hängt an E1/E2/E6 (Einfachheit,
Absicherung, Vertrauen). Monetarisierung ohne diese Basis kannibalisiert sich selbst.

**Wichtigste Validierungslücken:** Zahlungsbereitschaft für 5 % Base-Fee (ungetestet),
Ziel-TVL/Vault, Oracle-Robustheit für HWM/USD-Bemessung, rechtliche Einordnung
Performance-Fee + PEC-Burn (TBD — needs research).

## E. Roadmap-Vorschlag (drei Horizonte, Begründung: Vertrauen vor Kasse)

**H1 — Vertrauen & Kern härten:**
E2.1 Slippage-Schutz + E2.2 Action-Whitelist (die zwei dokumentierten Risiken) ·
ENG-48 **S1** (Rabatt-Vektor — Wurzel, blockiert alles Weitere) · E5-MVP
(Fehlschlag-Benachrichtigung) · Audit-Vorbereitung (E6). Parallel: offene
Baseline-Tickets (gitleaks, Branch-Schutz).

**H2 — Monetarisierung live + Einsteiger-UX:**
S2 Performance-Fee · S3 Base-Fee in validierter Höhe · E4 Pläne + S4 Free-Tx ·
E1 Template-First-Galerie · Audit durchführen.

**H3 — Skalierung:**
S5 PEC-Burn · E8 Multi-Chain · E7 gehosteter KI-Assistent · Track-Record/Social-Proof.

**Begründung der Reihenfolge:** Niemand zahlt laufende Gebühren auf einem un-auditierten
Vault ohne Slippage-Schutz; S1 ist technische Wurzel und zugleich risikoarm; die
Einsteiger-UX (E1) lohnt erst, wenn das, was Einsteiger anfassen, abgesichert ist (E2).

## F. Offene strategische Entscheidungen (→ Grilling)

1. Ziel-Persona V1: Power-User-Beachhead vs. Einsteiger-Nordstern — was priorisiert H2?
2. Base-Fee: 5 % halten / senken / in Pläne verschieben?
3. Reihenfolge bestätigen: Absicherung (E2) vor Monetarisierung (S2/S3)?
4. PEC-Tokenomics: verbindlicher V1-Bestandteil oder H3?
5. Multi-Chain: BSC-only bis PMF?
