# Pecunity — Wireframes & Informationsarchitektur

Strukturelle Grundlage für Design-Arbeit an den Frontend-Seiten. Dieses Dokument
beschreibt **was auf jeder Seite steht, in welcher Hierarchie und warum** — nicht
wie es aussieht. Farben, Typografie und Ausdruck kommen aus dem Brand-Kit
(siehe `packages/frontend/PRODUCT.md`) und den Design-Entscheidungen, die auf
diesem Dokument aufsetzen.

Quellen: `docs/produkt.md` (Nutzer-Journey, 9 Stationen, Leitplanken) und
`packages/frontend/PRODUCT.md` (Nutzergruppen, Prinzipien, Marke).

## Wie dieses Dokument zu lesen ist

Jede Seite trägt einen Status:

- **[Gebaut]** — existiert im Code; das Wireframe beschreibt die Ziel-Struktur
  der bestehenden Seite (Redesign-Grundlage, Funktionsumfang bleibt).
- **[Geplant]** — nächstes Arbeitspaket (`docs/prd/absicherungs-paket.md`) oder
  konkret absehbar.
- **[Zielbild]** — Teil der Journey aus `docs/produkt.md`, noch nicht terminiert.
  Wireframe existiert, damit die Informationsarchitektur heute schon Platz
  dafür lässt (Navigation, Routen, Hierarchie).

Jede Seite trägt außerdem ihren **Modus** — wofür der Besucher da ist:
*Operate* (Aufgabe erledigen: Scanbarkeit und Konsistenz vor Ausdruck) oder
*Persuade* (entscheiden und handeln: Aufmerksamkeit verdienen, mit
nachprüfbaren Zahlen, nie mit erfundenen).

Leitplanken, die jede Seite strukturell einlösen muss:

1. **Stille heißt nachweisbar „alles in Ordnung"** — jede Übersichtsseite
   braucht einen sichtbaren Frische-/Gesundheitsstatus, nie nur Abwesenheit
   von Fehlern.
2. **Absicherung ist Default, sichtbar** — Schutzmechanismen erscheinen als
   aktiver Zustand, nicht als versteckte Einstellung.
3. **Keine Signatur ohne Confirm-Gate** — jede signierende Aktion läuft durch
   dasselbe Bestätigungs-Muster (siehe Muster C), auch vom Copiloten angestoßen.
4. **Ehrliche Rückmeldung** — Fehlerzustände sind vollwertige Layouts, keine
   nachträglichen Toasts.
5. **Keine erfundenen Zahlen** — wo Track-Records, Performance oder Nutzerzahlen
   im Wireframe stehen, dürfen sie erst erscheinen, wenn echte Daten existieren.

---

## 1. Sitemap (Zielbild)

```
ÖFFENTLICH (kein Login)
├── /                        Discovery: Galerie + Markt-Teaser     [Gebaut: statisch — echte Strategie-Mechanik, Beispiel-Märkte, noch keine Live-Daten]
├── /strategies/:id          Strategie-Detail mit Track-Record     [Zielbild]
├── /markets                 Märkte & Renditen                     [Zielbild]
└── /connect                 Anmelden (Wallet | E-Mail/Social)     [Gebaut: Wallet]

ANGEMELDET (self-custody, SIWE)
├── /dashboard               Portfolio-Cockpit über alle Vaults    [Gebaut: Vault-Liste]
├── /vault/create            Vault anlegen                         [Gebaut]
├── /vault/:address          Vault-Cockpit                         [Gebaut]
│   └── /automation/:id/edit Graph-Editor (Expertenmodus)          [Gebaut]
└── /settings                Konto, Benachrichtigungen, Gebühren   [Zielbild]

QUER DURCH ALLES
├── Copilot-Panel            überall aufrufbar, andockend          [Zielbild]
├── Confirm-Gate             Dialog-Muster für jede Signatur       [Gebaut: Deploy-Dialog]
└── Demo-Modus               App mit Papiergeld, gleiche Seiten    [Zielbild]
```

Heutiger Code: `/` (öffentliche Discovery), `/connect`, `/dashboard`,
`/vault/create`, `/vault/:address`, `/vault/:address/automation/:id/edit`;
alles andere leitet auf `/` um. Der Einstieg ist damit umgedreht: unbekannte
Besucher landen auf dem Schaufenster, nicht auf einem Login-Formular.

---

## 2. App-Shell

Zwei Schalen, ein Produkt:

**Öffentliche Schale** (Discovery, Märkte, Strategie-Detail): Logo (Wortmarke),
Navigation `Strategien · Märkte`, rechts ein einziger Call-to-Action
(„Ausprobieren" → Demo, sekundär „Anmelden"). Kein Wallet-Chip.

**App-Schale** (alles hinter Login):

```
┌──────────────────────────────────────────────────────────────────┐
│ [Symbol]  Dashboard   Entdecken   Märkte        [◉ Status] [0x…a4] [🤖] │  Top-Bar
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│                        Seiteninhalt                              │
│                                                                  │
│                                              ┌─────────────────┐ │
│                                              │  Copilot-Panel  │ │  andockbar,
│                                              │  [Zielbild]     │ │  überall gleich
│                                              └─────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

- **[◉ Status]** ist die Einlösung von Leitplanke 1: ein globaler Indikator
  „alle Wächter aktiv, Daten frisch von HH:MM" — klickbar zur Detail-Ansicht.
  Nie nur ein grüner Punkt ohne Begründung.
- **[0x…a4]** Konto-Chip: Adresse, Netz (BSC), Abmelden.
- **[🤖]** öffnet das Copilot-Panel (Muster D). Auf jeder Seite an derselben
  Stelle.
- Heutige Seiten haben keine Shell (jede Seite steht allein, `max-w-4xl`).
  Die Shell ist der erste sinnvolle Design-Schritt, weil sie alle Seiten erbt.

Mobil: Top-Bar bleibt, Navigation kollabiert in ein Menü; Copilot wird
Vollbild-Sheet von unten.

---

## 3. Seiten

### 3.1 `/` Discovery — [Gebaut: statisch] · Persuade · Station 1+2

Zweck: Der erste Kontakt. Verkauft mit nachprüfbaren Zahlen, nicht mit
Versprechen. Muss ohne Anmeldung voll erlebbar sein.

```
┌──────────────────────────────────────────────────────────────────┐
│  Öffentliche Schale                                              │
├──────────────────────────────────────────────────────────────────┤
│  HERO                                                            │
│  Kernaussage: „DeFi wie eine Finanz-App. Selbstverwahrt.         │
│  Abgesichert. Läuft von allein."                                 │
│  [Ausprobieren (Demo)]   [Strategien ansehen ↓]                  │
│  Vertrauens-Zeile: nur belegbare Fakten (Audit, Open Source,     │
│  „kein Admin-Zugriff auf Gelder") — KEINE Nutzerzahlen/TVL,      │
│  solange keine echten existieren                                 │
├──────────────────────────────────────────────────────────────────┤
│  STRATEGIE-GALERIE                        [Filter: Risiko ▾]     │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐                    │
│  │ Name       │ │ Name       │ │ Name       │   Karte:           │
│  │ Risiko-    │ │            │ │            │   · Risiko-Label   │
│  │ Label      │ │            │ │            │   · echter Track-  │
│  │ ∿ Track-   │ │            │ │            │     Record (Chart) │
│  │   Record   │ │            │ │            │   · APY + Zeitraum │
│  │ APY · Zeit │ │            │ │            │   · Protokolle     │
│  └────────────┘ └────────────┘ └────────────┘                    │
├──────────────────────────────────────────────────────────────────┤
│  MÄRKTE-TEASER (wie Kurslisten beim Broker)                      │
│  Asset | Pool/Protokoll | Rendite | 7d-Verlauf     [Alle →]      │
│  … 5 Zeilen …                                                    │
├──────────────────────────────────────────────────────────────────┤
│  SO FUNKTIONIERT'S (3 Schritte: Verbinden → Strategie → Läuft)   │
│  + Selbstverwahrungs-Erklärung („dein Vault, dein Schlüssel")    │
├──────────────────────────────────────────────────────────────────┤
│  Footer: Audit-Links, Doku, Kontakt, rechtliche Hinweise         │
└──────────────────────────────────────────────────────────────────┘
```

- Hierarchie: Galerie ist das Zentrum, nicht der Hero — die Strategien SIND
  das Argument.
- Karten-Klick → `/strategies/:id` (öffentlich): volle Historie, Simulation
  („was passiert bei −20 %?"), Bausteine der Strategie in Klartext,
  [Übernehmen] → führt durch Anmeldung in Station 4.
- Anti-Goal: kein Krypto-Casino-Look, keine Raketen, keine FOMO-Zähler.
  Ton: Broker, nicht Meme.

### 3.2 `/connect` Anmelden — [Gebaut: Wallet-Weg] · Operate · Station 3

Zweck: Zwei Türen, ein Ergebnis (immer self-custody). Heute existiert nur die
Wallet-Tür; das Layout muss die zweite Tür schon vorsehen.

```
┌──────────────────────────────────────────────┐
│              [Logo Wortmarke]                │
│   Ein Satz, was hier passiert und was NICHT  │
│   („Anmeldung per Signatur — keine Kosten,   │
│    keine Vollmacht, kein Zugriff auf Gelder")│
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │  Wallet verbinden        [Gebaut]      │  │
│  │  MetaMask · WalletConnect · …          │  │
│  └────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────┐  │
│  │  Mit E-Mail starten      [Zielbild]    │  │
│  │  Embedded Wallet, selbstverwahrt       │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  Zustände (vollwertig, an Ort und Stelle):   │
│  · Signatur ausstehend („Blick in die        │
│    Wallet") · abgelehnt · falsches Netz      │
│    (mit [Zu BSC wechseln]) · Fehler          │
└──────────────────────────────────────────────┘
```

- Der SIWE-Schritt (erst verbinden, dann signieren) ist zweistufig sichtbar —
  nicht zwei überraschende Popups nacheinander.
- Anti-Goal: Login-Formular-Gefühl. Das ist eine Tür, kein Verhör.

### 3.3 `/dashboard` Portfolio-Cockpit — [Gebaut: Vault-Liste] · Operate · Station 8

Zweck: Das Gesamtbild über alle Vaults, ohne hinzusehen zu müssen. Heute:
Adresse + Vault-Tabelle. Ziel-Struktur:

```
┌──────────────────────────────────────────────────────────────────┐
│  App-Shell                                                       │
├──────────────────────────────────────────────────────────────────┤
│  KPI-BAND (aggregiert über alle Vaults)                          │
│  Gesamtwert USD   ·   Netto-Equity   ·   PnL (flow-adjustiert)   │
│  + Frische: „Stand HH:MM:SS ◉"                                   │
├──────────────────────────────────────────────────────────────────┤
│  MELDUNGEN (nur wenn vorhanden — sonst 1 Zeile:                  │
│  „Alle Wächter aktiv, letzte Prüfung HH:MM")            [Geplant]│
│  ⚠ Ausführung fehlgeschlagen · Health-Factor · Gas-Depot fast leer│
├──────────────────────────────────────────────────────────────────┤
│  DEINE VAULTS                                  [+ Vault anlegen] │
│  Label | Wert USD | PnL | Automationen | Status | Zuletzt aktiv  │
│  Zeile klickbar → /vault/:address                                │
│                                                                  │
│  Leer-Zustand: erklärt was ein Vault ist + [Ersten Vault anlegen]│
│  + Verweis auf Galerie („oder Strategie aus der Galerie starten")│
├──────────────────────────────────────────────────────────────────┤
│  WERTVERLAUF (Portfolio gesamt, Zeitraum-Umschalter)  [Zielbild] │
└──────────────────────────────────────────────────────────────────┘
```

- Hierarchie: Zahlen zuerst (das Gesamtbild ist das Produktversprechen),
  Meldungen direkt darunter (Leitplanke 4), dann die Liste.
- Der Meldungen-Block ist niemals leer-unsichtbar: kein Alarm heißt sichtbar
  „nachweisbar in Ordnung", nicht „nichts da".

### 3.4 `/vault/create` Vault anlegen — [Gebaut] · Operate · Station 6

Zweck: Der eigene Smart Contract entsteht. Der Moment muss Vertrauen
aufbauen, nicht nur ein Formular abschicken.

```
┌──────────────────────────────────────────────┐
│  ← Zurück                                    │
│  Vault anlegen                               │
│                                              │
│  1  Label            [___________]           │
│  2  Deposit-Token    [USDT ▾]                │
│                                              │
│  WAS HIER ENTSTEHT (statischer Erklärblock)  │
│  · Ein Contract, den nur du kontrollierst    │
│  · Kein Admin-Zugriff des Anbieters          │
│  · Jede Vollmacht später einzeln bestätigt   │
│                                              │
│  [Vault anlegen]  → Confirm-Gate (Muster C)  │
│                                              │
│  Zustände: Deploy läuft (Tx-Hash sichtbar) · │
│  fehlgeschlagen (Grund + erneut) · fertig    │
│  (→ Weiterleitung Vault-Cockpit)             │
└──────────────────────────────────────────────┘
```

### 3.5 `/vault/:address` Vault-Cockpit — [Gebaut] · Operate · Station 7+8

Zweck: Ein Vault im Detail: Wert, Positionen, Automationen, Historie. Die
heutige Seite hat alle Bausteine als vertikalen Stapel; die Ziel-Struktur
ordnet sie nach Dringlichkeit der Nutzerfrage: *Wie steht es?* → *Was läuft?*
→ *Was ist passiert?*

```
┌──────────────────────────────────────────────────────────────────┐
│  App-Shell                                                       │
├──────────────────────────────────────────────────────────────────┤
│  KOPF   Label (editierbar) · 0xAdresse (kopierbar) · Netz        │
│         [Einzahlen] [Abheben]                    Frische ◉ HH:MM │
├──────────────────────────────────────────────────────────────────┤
│  WIE STEHT ES?                                                   │
│  ┌───────────────┐ ┌──────────────────────────────────────────┐  │
│  │ Gesamtwert    │ │ Wertverlauf (Chart, Zeitraum-Umschalter, │  │
│  │ Netto-Equity  │ │ Ein-/Auszahlungen als Marker)            │  │
│  │ PnL fair      │ │                                          │  │
│  └───────────────┘ └──────────────────────────────────────────┘  │
│  Positionen: Wallet-Bestände + Protokoll-Positionen (LP, Lending)│
│  Token | Menge | Preis | Wert  — mit Protokoll-Zuordnung         │
├──────────────────────────────────────────────────────────────────┤
│  WAS LÄUFT?                                                      │
│  Automationen: Name | Auslöser (Klartext) | Status | [Bearbeiten]│
│  [+ Automation]  → Graph-Editor                                  │
│  Gas-Depot: Stand, Reichweiten-Schätzung, [Aufladen] — wird Teil │
│  dieses Blocks, denn es beantwortet „läuft es weiter?"           │
│  Schutz-Status [Geplant]: aktive Wächter (Stop-Loss, Health-     │
│  Factor, Max-Verlust) als sichtbare Karte, nicht als Einstellung │
├──────────────────────────────────────────────────────────────────┤
│  WAS IST PASSIERT?                                               │
│  Historie: Zeit | Automation | Aktion | Ergebnis-Badge | Tx-Link │
│  Fehlschläge prominent, nie verschluckt (Leitplanke 4)           │
└──────────────────────────────────────────────────────────────────┘
```

- Einzahlen/Abheben sind Kopf-Aktionen, die als Dialog/Sheet öffnen (heute
  Formulare im Fluss) — sie sind selten, der Überblick ist täglich.
- Mobil: dieselbe Reihenfolge einspaltig; KPI vor Chart.

### 3.6 Graph-Editor — [Gebaut] · Operate · Station 4 (Expertenmodus)

Zweck: Strategien frei komponieren. Werkzeug, kein Dokument — volle
Viewport-Höhe, drei Zonen. Die heutige Struktur (Toolbar, Canvas, Side-Panel,
Validierungs-Panel, Kontext-Panel) ist funktional richtig und bleibt:

```
┌──────────────────────────────────────────────────────────────────┐
│ TOOLBAR  Name · Speichern-Status (Auto-Save) · [Debug] [Deploy]  │
├───────────────────────────────────────────────┬──────────────────┤
│                                               │ SIDE-PANEL       │
│  CANVAS (@xyflow)                             │ gewählter Step:  │
│   [Condition] ──▶ [Action] ──▶ [Action]       │ Schema-Formular, │
│                                               │ Kontext-Ein/Aus- │
│   [+ Step]                                    │ gaben, Variablen │
│                                               ├──────────────────┤
│                                               │ VALIDIERUNG      │
│                                               │ Fehler klickbar  │
│                                               │ → springt zum    │
│                                               │   Node           │
├───────────────────────────────────────────────┴──────────────────┤
│ KONTEXT-LEISTE: Variablen des Graphen (an/abdockbar)             │
└──────────────────────────────────────────────────────────────────┘
```

- Validierung nimmt On-Chain-Fehler vorweg — sie ist ständig sichtbar, kein
  Popup beim Deploy.
- [Deploy] öffnet das Confirm-Gate (Muster C) mit zweiphasigem Ablauf.
- Anti-Goal: Der Editor wird nicht „vereinfacht" — Einsteiger bekommen die
  Galerie und den Copiloten, nicht einen kastrierten Editor (docs/produkt.md:
  keine Gruppe wird der anderen geopfert).
- Mobil: nicht Kern-Zielgruppe des Editors; lesbarer Read-only-Modus genügt.

### 3.7 `/markets` Märkte & Renditen — [Zielbild] · Operate

Vollbild-Version des Discovery-Teasers: filterbare Tabelle (Asset, Protokoll,
Pool, Rendite, Verlauf), öffentlich zugänglich. Zeilen-Klick → Detail mit
[In Strategie verwenden].

---

## 4. Wiederkehrende Muster

### Muster C — Confirm-Gate (jede Signatur) · [Gebaut: Deploy-Dialog, wird Standard]

Ein Dialog-Muster für alles, was Vollmachten erteilt oder Gelder bewegt —
manuell oder vom Copiloten angestoßen. Zweiphasig: erst prüfbar vorschlagen,
dann bestätigt ausführen.

```
┌──────────────────────────────────────────────┐
│  Was du gleich signierst                     │
│                                              │
│  KLARTEXT: „Erlaubt dem Vault, bis zu        │
│  500 USDT in Pool X zu tauschen."            │
│  ▸ Technische Details (aufklappbar:          │
│    Contract, Methode, Parameter, Gas)        │
│                                              │
│  AKTIVE ABSICHERUNG (immer sichtbar):        │
│  ✓ Slippage-Schutz 0,5 %                     │
│  ✓ Nur geprüfte Bausteine (Whitelist)        │
│                                              │
│  [Abbrechen]              [Signieren]        │
│  danach: Ausstehend → Bestätigt (Tx-Link)    │
│          oder Fehlgeschlagen (Grund, ehrlich)│
└──────────────────────────────────────────────┘
```

- Der Klartext-Satz ist Pflicht-Hierarchieebene 1; technische Details sind
  Ebene 2. Nie umgekehrt.
- Opt-outs (Whitelist aus, Slippage höher) erscheinen HIER als bewusste,
  markierte Abweichung — Risiko ist Opt-in (Leitplanke 2).

### Muster D — Copilot-Panel · [Zielbild]

Andockendes Panel (rechts, mobil als Sheet), auf jeder Seite an derselben
Stelle, kennt den Seiten-Kontext („diese Position", „dieser Vault").

```
┌─────────────────────────┐
│ Copilot            [×]  │
│─────────────────────────│
│ Kontext-Chip:           │
│ „Vault: Main · BSC"     │
│                         │
│ Verlauf …               │
│                         │
│ Vorschlags-Karte:       │
│ „Range nachziehen?"     │
│ [Ansehen] → Confirm-Gate│
│─────────────────────────│
│ [Eingabe …          ➤]  │
└─────────────────────────┘
```

- Der Copilot signiert NIE selbst; jede vorgeschlagene Aktion mündet im
  Confirm-Gate (Leitplanke 3). Vorschlags-Karten sind visuell klar von
  Antworten getrennt.

### Muster E — Zustände (jede Seite)

Jede Daten-Sektion hat vier vollwertige Layouts, an derselben Stelle im
Dokument-Fluss (kein Layout-Sprung):

- **Laden:** Skeleton in der Ziel-Geometrie.
- **Leer:** erklärt, was hier stehen wird, + der eine nächste Schritt.
  Leer-Zustände sind Onboarding, kein Achselzucken.
- **Fehler:** was schiefging, in Klartext, + [Erneut versuchen]. Nie leer
  aussehen, wenn etwas kaputt ist.
- **Frische:** Daten tragen ihren Stand („HH:MM:SS") — veraltete Daten sind
  markiert, nicht stillschweigend alt (heute: `freshness-indicator`).

### Muster F — Demo-Modus · [Zielbild]

Kein separates Seiten-Set: dieselben Seiten mit Papiergeld und einem
permanenten, unübersehbaren Banner in der Shell („Demo — Papiergeld ·
[Echtes Konto starten]"). Wireframes ändern sich nicht; nur die Shell trägt
den Zustand.

---

## 5. Reihenfolge für Design-Arbeit

Aus Beachhead-Entscheidung (Power-User zuerst) und Ist-Stand ergibt sich:

1. **App-Shell + Muster E** — vererbt auf alles Bestehende.
2. **Vault-Cockpit** (3.5) — die tägliche Seite des Power-Users.
3. **Dashboard** (3.3) und **Confirm-Gate** (Muster C) als Standard.
4. **Graph-Editor-Politur** (3.6) — funktional fertig, visuell angleichen.
5. **Connect** (3.2).
6. Discovery/Märkte/Copilot/Demo folgen, wenn Track-Record-Daten und
   Absicherungs-Paket sie tragen können.
