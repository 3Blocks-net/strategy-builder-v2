# Epic: Pecunity MCP-Server — DeFi-Vaults per KI-Assistent steuern

Ein Nutzer verbindet seine Claude Desktop App über einen **Pecunity MCP-Server** mit seiner
Wallet, authentifiziert sich, und kann seine Vaults und Automations per natürlicher Sprache
einsehen, bauen, deployen und verwalten — inkl. Geldbewegung. Vorbild ist n8ns „MCP Server
Trigger" (jeder Workflow wird zum AI-Tool); der Vorsprung ist, dass unser `paramSchema` bereits
JSON-Schema (MCP-natives Tool-Format) ist und die validierende Encode-Boundary fehlerhaften
KI-Output abfängt.

## Scope-Annahmen (aus den geklärten Entscheidungen)

- **Custody:** Der MCP-Server **signiert selbst** (Zugriff auf einen Private Key bzw.
  äquivalenten Wallet-Zugang). → höchste Autonomie, höchstes Risiko → Story 7 ist Pflicht.
- **Umfang:** **voller Lebenszyklus** — lesen, Vault erstellen, Automation bauen+deployen,
  deposit/withdraw, aktivieren/deaktivieren.
- **AI-Building:** **Kern des MVP** — der Agent baut Automation-Graphen aus natürlicher Sprache;
  die Encode-Boundary (`mapGraphToRaw` + `validateParams(mode:'raw')` + Raw-Mode-Guards) ist die
  Guardrail.
- **Deployment (lokal vs. gehostet):** **offen** → in „Offene Entscheidungen" als bewusste Wahl
  mit Trade-offs aufbereitet; Story 1 ist soweit wie möglich deployment-agnostisch formuliert.
- **Out of scope (erste Iteration):** Multi-Wallet/Team-Accounts, Strategie-Marktplatz-Anbindung
  über MCP, Community-/Third-Party-Tools, KI-Konsum externer MCP-Server (n8ns „MCP Client").

## Abhängigkeitsreihenfolge

```
Story 1 (Wallet verbinden & authentifizieren)  ── Fundament für alles
   ├─→ Story 2 (Lesen/Discovery)
   ├─→ Story 3 (Aktions-Katalog KI-lesbar)  ──┐
   ├─→ Story 4 (Vault erstellen)              │
   │                                          ├─→ Story 5 (Automation aus Sprache bauen & deployen)  ← Kern-MVP
   └─→ Story 7 (Schutzmechanismen) ── Pflicht-Querschnitt für 4, 5, 6
                                              └─→ Story 6 (Geld bewegen & Lifecycle)
```

| # | Story | Persona | Kern-Wert | Risiko |
|---|-------|---------|-----------|--------|
| 1 | Wallet verbinden & authentifizieren | DeFi-Nutzer | Identität, Zugang | 🔴 hoch (Key) |
| 2 | Vaults, Portfolio & Verlauf einsehen | DeFi-Nutzer | Discovery, Überblick | 🟢 niedrig |
| 3 | Aktions-Katalog KI-lesbar beschreiben | (Enabler) | Richtige Baustein-Wahl | 🟢 niedrig |
| 4 | Vault per KI erstellen | DeFi-Nutzer | Onboarding ohne UI | 🟡 mittel |
| 5 | Automation aus Sprache bauen & deployen | Strategie-Nutzer | Der „Wow"-Effekt | 🔴 hoch |
| 6 | Gelder bewegen & Lifecycle verwalten | Vault-Betreiber | Volle Kontrolle per Chat | 🔴 hoch |
| 7 | Schutzmechanismen (Bestätigung, Limits, Simulation, Audit) | DeFi-Nutzer | Vertrauen & Schadensbegrenzung | — (Pflicht) |

---

## Story 1 — Meine Wallet mit Claude Desktop verbinden und mich authentifizieren

### Beschreibung

**WHO:** Als **selbstverwaltender DeFi-Nutzer** (besitzt bereits Pecunity-Vaults oder will welche
anlegen und nutzt Claude Desktop als KI-Assistenten, statt jedes Mal die Web-UI zu öffnen)

**WHAT:** möchte ich den Pecunity MCP-Server in meiner Claude Desktop App einrichten und ihm einen
sicheren Zugang zu meiner Wallet hinterlegen, sodass der Server in meinem Namen als Owner
authentifiziert ist

**WHY:** damit der KI-Assistent ausschließlich auf meine eigenen Vaults zugreift und ich überhaupt
erst eine vertrauenswürdige Basis für alle weiteren Aktionen habe

### Akzeptanzkriterien (Confirmation)

- [ ] Es gibt eine **dokumentierte Konfiguration** für Claude Desktop, mit der der Pecunity
      MCP-Server registriert wird (Server-Name, Verbindungsparameter)
- [ ] Der Nutzer kann seinen **Wallet-Zugang hinterlegen** (z. B. Private Key als Referenz-Beispiel
      oder ein gleichwertiger Mechanismus) — der Zugang wird **nicht im Klartext geloggt** und
      erscheint **nicht** in Tool-Ausgaben an das LLM
- [ ] Der MCP-Server leitet aus dem Wallet-Zugang die **Owner-Adresse** ab und authentifiziert sich
      gegenüber dem Pecunity-Backend (SIWE-/Signatur-basiert, analog zum bestehenden Auth-Flow)
- [ ] Nach erfolgreicher Verbindung kann der Nutzer den Agenten fragen „**mit welcher Adresse bin
      ich verbunden?**" und erhält die korrekte, erwartete Adresse zurück
- [ ] Alle folgenden Tools operieren **ausschließlich** im Kontext genau dieser Owner-Adresse; ein
      Zugriff auf fremde Vaults ist nicht möglich
- [ ] Bei **fehlendem/ungültigem** Wallet-Zugang liefert der Server eine **klare, sichere
      Fehlermeldung** (kein Stacktrace, keine Key-Fragmente)
- [ ] Beim ersten Verbinden wird ein **deutlicher Sicherheitshinweis** angezeigt: der Server kann in
      deinem Namen signieren — was das bedeutet und wie man den Zugang wieder entzieht
- [ ] Der Nutzer kann die Verbindung **wieder trennen/den Zugang entfernen** (dokumentierter Weg)

### INVEST-Check

| Kriterium | Erfüllt | Begründung |
|-----------|---------|------------|
| **I**ndependent — eigenständig umsetzbar? | Ja | Verbindung + Auth steht für sich; alle anderen Stories konsumieren nur das Ergebnis. |
| **N**egotiable — Raum für Anpassung? | Ja | Konkreter Wallet-Zugangs-Mechanismus (roher Key vs. Keystore/Env/externer Signer) und Hinweis-Wording sind offen verhandelbar. |
| **V**aluable — klarer Nutzen? | Ja | Ohne sichere Identität gibt es keine vertrauenswürdige MCP-Nutzung — das Fundament. |
| **E**stimable — schätzbar? | Teilweise | Die Wahl des Wallet-Zugangs-Mechanismus und das Deployment-Modell (lokal/remote) müssen vor Schätzung fixiert werden. |
| **S**mall — passt in eine Iteration? | Ja | Auf Verbinden + Authentifizieren + Identität-zurückgeben begrenzt; keine schreibenden Vault-Operationen. |
| **T**estable — überprüfbar? | Ja | Korrekte Adresse, kein Key-Leak in Logs/Ausgaben, fremde Vaults unzugänglich — alles testbar. |

> Nicht alle INVEST-Kriterien müssen zwingend erfüllt sein — Orientierung fürs Refinement.

### Definition of Done

- [ ] Alle Akzeptanzkriterien sind getestet und erfüllt
- [ ] Code-Review durch mindestens 1 Entwickler erfolgt
- [ ] **Sicherheits-Review** des Key-Handlings (kein Logging, kein Leak in LLM-Ausgaben) erfolgt
- [ ] Setup-Dokumentation (Claude-Desktop-Config + Wallet-Zugang + „Verbindung trennen") vorhanden
- [ ] Negativtests: ungültiger/fehlender Zugang führt zu sicherer Fehlermeldung
- [ ] Keine offenen Blocker oder Abhängigkeiten

---

## Story 2 — Meine Vaults, Portfolio und Ausführungsverlauf per KI einsehen

### Beschreibung

**WHO:** Als **verbundener DeFi-Nutzer**, der schnell einen Überblick will, ohne die Web-App zu
öffnen

**WHAT:** möchte ich den KI-Assistenten nach meinen Vaults, deren Portfolio-Werten, den
konfigurierten Automations und dem Ausführungsverlauf (inkl. Fehlern) fragen

**WHY:** damit ich den Zustand meiner Strategien im Chat-Kontext verstehe und fundierte
Folgeentscheidungen treffen kann

### Akzeptanzkriterien (Confirmation)

- [ ] Der Agent kann **alle Vaults der verbundenen Adresse auflisten** (Adresse, Label, Deposit-Token)
- [ ] Pro Vault kann der Agent **Portfolio/Bestände** und den **Gas-Deposit-Stand** abrufen
- [ ] Der Agent kann die **Automations eines Vaults** auflisten (aktiv/pausiert, owner-only/public,
      Kurzbeschreibung der Schritte)
- [ ] Der Agent kann den **Ausführungsverlauf** abrufen (erfolgreiche Runs, Deposits/Withdraws und
      **dekodierte Fehlschläge** wie `Step N: <reason>`)
- [ ] Alle Lese-Tools liefern **strukturierte, fürs LLM gut interpretierbare** Ergebnisse (nicht nur
      Roh-Hex)
- [ ] Sämtliche Abfragen sind **streng auf die eigenen Vaults** des verbundenen Owners begrenzt
- [ ] Bei einem Vault **ohne Daten** (keine Automations / keine Runs) erhält der Agent eine klare
      Leer-Antwort statt eines Fehlers

### INVEST-Check

| Kriterium | Erfüllt | Begründung |
|-----------|---------|------------|
| **I**ndependent | Nein | Setzt Story 1 (Identität) voraus; danach aber rein lesend und eigenständig. |
| **N**egotiable | Ja | Welche Kennzahlen/Detailtiefe, Tool-Zuschnitt (ein „get_vault" vs. mehrere) sind offen. |
| **V**aluable | Ja | Sofortiger Nutzen + sichere erste schreibfreie Stufe; liefert dem Agenten Kontext für alle Folge-Aktionen. |
| **E**stimable | Ja | Schöpft aus vorhandenen Backend-Endpunkten (Vault-, Portfolio-, Indexer-Module); klarer Umfang. |
| **S**mall | Ja | Reine Read-Tools, keine Signaturen. |
| **T**estable | Ja | Korrekte Listen, Owner-Begrenzung, Leerzustände, dekodierte Fehler — prüfbar. |

### Definition of Done

- [ ] Alle Akzeptanzkriterien sind getestet und erfüllt
- [ ] Code-Review durch mindestens 1 Entwickler erfolgt
- [ ] Test: Owner-Begrenzung (fremde Vaults nicht abrufbar)
- [ ] Test: Leerzustände und dekodierte Fehlschläge korrekt wiedergegeben
- [ ] Keine offenen Blocker oder Abhängigkeiten

---

## Story 3 — Die verfügbaren Bausteine (Conditions/Actions) KI-lesbar beschreiben

### Beschreibung

**WHO:** Als **DeFi-Nutzer** (mittelbar über den KI-Assistenten, der die richtigen Bausteine
auswählen können muss)

**WHAT:** möchte ich, dass der Agent einen **selbsterklärenden Katalog** aller verfügbaren
Conditions und Actions abrufen kann — mit Beschreibung, Parametern, „wann benutzen", Beispielen und
ggf. Risikohinweis

**WHY:** damit der Agent (und damit ich) die passenden Schritte für meine Strategie zuverlässig
auswählt, statt ungeeignete oder erfundene Bausteine zu verwenden

### Akzeptanzkriterien (Confirmation)

- [ ] Der Agent kann **alle StepTypes auflisten** (Conditions + Actions) mit Name, Kategorie und
      Kurzbeschreibung
- [ ] Der Agent kann zu einem StepType die **Detailbeschreibung** abrufen: `paramSchema` (Felder,
      Typen, Defaults), Bedeutung jedes Parameters und — sofern angereichert —
      **Subkategorie/Protokoll** (Aave/PancakeSwap/Time/Token), **„wann benutzen"**, **Beispiele**
      und **Risikohinweis** (vgl. Research-Backlog #1, Codex-Äquivalent)
- [ ] Die Beschreibung macht klar, welche **Kontext-Slots** ein Schritt liest/schreibt
      (Output-Verständnis), soweit das Schema das hergibt
- [ ] Der Katalog spiegelt **nur tatsächlich deployte** StepTypes wider (keine Bausteine mit
      Null-Adresse)
- [ ] Die Ausgabe ist **JSON-Schema-treu** (keine Übersetzung in ein proprietäres Format), damit der
      Agent sie nativ konsumieren kann

### INVEST-Check

| Kriterium | Erfüllt | Begründung |
|-----------|---------|------------|
| **I**ndependent | Teilweise | Technisch nach Story 1 eigenständig auslieferbar; der **Wert** entfaltet sich aber erst mit Story 5 (Building). |
| **N**egotiable | Ja | Umfang der Metadaten-Anreicherung (nur vorhandene `description` vs. volle Codex-Felder) ist verhandelbar und schrittweise erweiterbar. |
| **V**aluable | Ja | Direkte Voraussetzung für korrektes AI-Building; verbessert zugleich Discovery generell. |
| **E**stimable | Teilweise | Reines Exponieren bestehender `paramSchema` ist klar; die Metadaten-Anreicherung (whenToUse/examples/risk) ist eigener, abgrenzbarer Aufwand. |
| **S**mall | Ja | Zwei Read-Tools (list/describe) + optionale Schema-Anreicherung. |
| **T**estable | Ja | Vollständigkeit, Schema-Treue, Ausschluss undeployter Typen — prüfbar. |

> **Hinweis:** Die Metadaten-Anreicherung (Subkategorie, whenToUse, Beispiele, Risiko) kann bei
> Bedarf als eigene technische Task geführt werden — aus Nutzersicht bleibt sie Teil dieser Story.

### Definition of Done

- [ ] Alle Akzeptanzkriterien sind getestet und erfüllt
- [ ] Code-Review durch mindestens 1 Entwickler erfolgt
- [ ] Test: undeployte/Null-Adress-StepTypes erscheinen nicht
- [ ] Beispiel-Prompt verifiziert, dass ein LLM aus dem Katalog einen Baustein korrekt auswählt
- [ ] Keine offenen Blocker oder Abhängigkeiten

---

## Story 4 — Einen neuen Vault per KI-Assistent erstellen

### Beschreibung

**WHO:** Als **neuer oder expandierender DeFi-Nutzer**, der einen weiteren Vault braucht

**WHAT:** möchte ich den KI-Assistenten anweisen, in meinem Namen einen neuen Vault zu erstellen
(mit Label und Deposit-Token), wobei der MCP-Server die Transaktion signiert und sendet

**WHY:** damit ich ohne Web-UI direkt im Chat einen einsatzbereiten Vault bekomme

### Akzeptanzkriterien (Confirmation)

- [ ] Der Agent kann mit den nötigen Angaben (Label, Deposit-Token) einen **Vault erstellen lassen**;
      der Server signiert + sendet die TX
- [ ] Vor dem Senden werden die Parameter **bestätigend zusammengefasst** (Schutzmechanismus aus
      Story 7 greift)
- [ ] Der gewählte **Deposit-Token wird validiert** (von FeeRegistry akzeptiert) — sonst klare
      Fehlermeldung, **bevor** eine TX gesendet wird
- [ ] Nach Erfolg liefert der Agent die **neue Vault-Adresse** und den TX-Hash (BscScan-fähig) zurück
- [ ] Der neue Vault erscheint anschließend in der Liste aus Story 2 **und** in der normalen
      Web-UI-Übersicht des Nutzers
- [ ] Schlägt die TX fehl, erhält der Nutzer eine **dekodierte, verständliche** Fehlermeldung statt
      eines rohen Reverts

### INVEST-Check

| Kriterium | Erfüllt | Begründung |
|-----------|---------|------------|
| **I**ndependent | Nein | Setzt Story 1 (Signing-Identität) und Story 7 (Bestätigung) voraus. |
| **N**egotiable | Ja | Pflichtangaben, Default-Token, Umfang der Bestätigung sind verhandelbar. |
| **V**aluable | Ja | Erster schreibender Lebenszyklus-Schritt; eigenständig nutzbar. |
| **E**stimable | Ja | Nutzt bestehende `createVault`-Logik; klar abgegrenzt. |
| **S**mall | Ja | Genau eine schreibende Operation. |
| **T**estable | Ja | Erfolgreiche Erstellung, Token-Validierung, Fehlerdekodierung, Sichtbarkeit in beiden Oberflächen — prüfbar. |

### Definition of Done

- [ ] Alle Akzeptanzkriterien sind getestet und erfüllt
- [ ] Code-Review durch mindestens 1 Entwickler erfolgt
- [ ] Test (Fork): Vault-Erstellung end-to-end inkl. Signatur
- [ ] Test: nicht akzeptierter Token wird **vor** dem Senden abgelehnt
- [ ] Bestätigungsschritt (Story 7) ist integriert und getestet
- [ ] Keine offenen Blocker oder Abhängigkeiten

---

## Story 5 — Eine Automation aus natürlicher Sprache bauen und deployen (Kern-MVP)

### Beschreibung

**WHO:** Als **Strategie-Nutzer**, der eine Automatisierungsidee in Worten beschreiben kann, aber
nicht den Graph-Editor bedienen will

**WHAT:** möchte ich dem KI-Assistenten eine Strategie in natürlicher Sprache beschreiben (z. B.
„kaufe wöchentlich für 50 USDT WBNB" oder „wenn mein Aave-Health-Factor unter 1,5 fällt, zahle
Schulden zurück") und er baut daraus eine **gültige Automation**, zeigt sie mir verständlich an und
deployt sie nach meiner Bestätigung in einen meiner Vaults

**WHY:** damit ich komplexe On-Chain-Strategien ohne Editor-Know-how erstellen kann — der eigentliche
„n8n-für-die-Blockchain"-Mehrwert

### Akzeptanzkriterien (Confirmation)

- [ ] Der Agent erzeugt aus der Beschreibung einen **Automation-Graphen** (Conditions/Actions,
      Reihenfolge, Kontext-Slots) ausschließlich aus den im Katalog (Story 3) verfügbaren Bausteinen
- [ ] Der erzeugte Graph durchläuft die bestehende **Encode-Boundary** (`mapGraphToRaw` +
      `validateParams(mode:'raw')` + Raw-Mode-Guards); **ungültige Graphen werden abgelehnt** (kein
      Deploy), mit einer Erklärung, was fehlt/falsch ist
- [ ] Der Agent **fasst die fertige Automation menschenlesbar zusammen** (welche Schritte, welche
      Beträge/Token, welcher Trigger) **vor** dem Deploy
- [ ] Der Deploy erfolgt erst nach **expliziter Bestätigung** des Nutzers (Story 7); der Server
      signiert ggf. die nötigen TX (Kontext-Setup + create/update)
- [ ] Nach Erfolg liefert der Agent die **On-Chain-Automation-ID** und TX-Hash(es) zurück; die
      Automation erscheint in Story 2 und der Web-UI
- [ ] Der Agent kann auf Wunsch **zuerst nur einen Entwurf** vorschlagen, ohne zu deployen
- [ ] Fehlt eine Voraussetzung (z. B. nicht existierendes PancakeSwap-Pool/Tier), wird das **vor dem
      Deploy** erkannt und erklärt (vgl. `usePoolValidity`)
- [ ] **Keine** erfundenen Adressen/Selektoren — nur seed-/katalog-gestützte StepTypes

### INVEST-Check

| Kriterium | Erfüllt | Begründung |
|-----------|---------|------------|
| **I**ndependent | Nein | Baut auf Story 1, 3 (Katalog) und 7 (Bestätigung) auf; braucht einen Ziel-Vault (Story 4 oder bestehend). |
| **N**egotiable | Ja | Tiefe der unterstützten Strategie-Muster, ob Entwurf-zuerst-Default, Umfang der Zusammenfassung sind offen. |
| **V**aluable | Ja | Das Herzstück und der wichtigste Differenzierer der Integration. |
| **E**stimable | Teilweise | Graph-Generierung aus Sprache ist die größte Unbekannte; sollte ggf. zunächst auf wenige kuratierte Muster (DCA, Stop-Loss, HF-Schutz) begrenzt werden, um schätzbar/klein zu bleiben. |
| **S**mall | Nein | In voller Allgemeinheit zu groß. **Empfehlung:** erste Iteration auf 2–3 Strategie-Muster begrenzen (Recipe-gestützt), dann erweitern. |
| **T**estable | Ja | Gültiger Graph, Boundary-Ablehnung Ungültiges, korrektes Deploy-Ergebnis, kein Deploy ohne Bestätigung — prüfbar (auch ohne LLM via fixierter Graph-Eingaben). |

> **Empfehlung zur Zerlegung:** Diese Story für das MVP auf **wenige kuratierte Strategie-Muster**
> begrenzen (passt zum Research-Backlog #6 „Template-/Recipe-Library"). Volles Freiform-Building als
> spätere Erweiterung. So wird sie „Small" und „Estimable".

### Definition of Done

- [ ] Alle Akzeptanzkriterien sind getestet und erfüllt
- [ ] Code-Review durch mindestens 1 Entwickler erfolgt
- [ ] Test: ungültiger Graph wird von der Encode-Boundary abgelehnt (kein Deploy, HTTP 400-Pfad)
- [ ] Test (Fork): mindestens ein Muster end-to-end bis zur feuernden Automation
- [ ] Test: kein Deploy ohne explizite Bestätigung
- [ ] Keine offenen Blocker oder Abhängigkeiten

---

## Story 6 — Gelder bewegen und den Automations-Lebenszyklus verwalten

### Beschreibung

**WHO:** Als **aktiver Vault-Betreiber**, der seine laufenden Strategien im Chat steuern will

**WHAT:** möchte ich den KI-Assistenten anweisen, in meine Vaults **einzuzahlen / auszuzahlen**, den
**Gas-Deposit aufzufüllen** und Automations **zu aktivieren/zu deaktivieren** — jeweils mit Signatur
durch den Server

**WHY:** damit ich den vollen Betrieb meiner Vaults ohne Web-UI steuern kann

### Akzeptanzkriterien (Confirmation)

- [ ] Der Agent kann **Deposit** (Token + Betrag) und **Withdraw** (Token + Betrag + Empfänger)
      ausführen lassen; Beträge werden korrekt in Base-Units konvertiert (Token-Decimals)
- [ ] Der Agent kann den **Gas-Deposit** eines Vaults auffüllen (`depositFees`) und `minFeeDeposit`
      setzen
- [ ] Der Agent kann eine Automation **aktivieren/deaktivieren** (`setAutomationActive`)
- [ ] **Jede geldbewegende Aktion** erfordert explizite Bestätigung mit Klartext-Zusammenfassung
      (Betrag, Token, Empfänger) — Story 7
- [ ] Eine Withdraw an eine **andere als die Owner-Adresse** wird besonders hervorgehoben bestätigt
      (Phishing-/Fehladressen-Schutz)
- [ ] Anfallende **Fees** (Deposit/Withdraw-BPS) werden dem Nutzer **vor** der Bestätigung
      transparent gemacht
- [ ] Bei fehlgeschlagener TX erhält der Nutzer eine **dekodierte** Fehlermeldung; kein stiller
      Teilerfolg
- [ ] Aktivieren/Deaktivieren spiegelt sich in Story 2 und der Web-UI wider

### INVEST-Check

| Kriterium | Erfüllt | Begründung |
|-----------|---------|------------|
| **I**ndependent | Nein | Setzt Story 1 (Signing) und Story 7 (Bestätigung/Limits) voraus. |
| **N**egotiable | Ja | Welche Operationen zuerst, Schwellen für „Sonderbestätigung", Empfänger-Whitelist sind verhandelbar. |
| **V**aluable | Ja | Vervollständigt den Lebenszyklus; eigenständiger Nutzen pro Operation. |
| **E**stimable | Ja | Nutzt bestehende deposit/withdraw/fee/toggle-Logik; klar. |
| **S**mall | Teilweise | Bündelt mehrere Operationen. **Optional splitten:** „Geldbewegung (deposit/withdraw)" vs. „Lifecycle (activate/deactivate + gas-deposit)". |
| **T**estable | Ja | Korrekte Beträge/Decimals, Fee-Transparenz, Empfänger-Sonderfall, Fehlerdekodierung — prüfbar. |

> **Empfehlung:** Bei zu großem Umfang in **6a Geldbewegung** und **6b Lifecycle/Gas-Deposit**
> trennen — 6a ist die höher-riskante Hälfte und profitiert von isoliertem Test.

### Definition of Done

- [ ] Alle Akzeptanzkriterien sind getestet und erfüllt
- [ ] Code-Review durch mindestens 1 Entwickler erfolgt
- [ ] **Sicherheits-Review** der geldbewegenden Pfade (Beträge, Empfänger, Limits) erfolgt
- [ ] Test (Fork): deposit/withdraw inkl. Decimals + Fee-Abzug korrekt
- [ ] Test: Withdraw an Fremdadresse löst Sonderbestätigung aus
- [ ] Keine offenen Blocker oder Abhängigkeiten

---

## Story 7 — Schutzmechanismen: Bestätigung, Limits, Simulation und Audit-Log (Pflicht-Querschnitt)

### Beschreibung

**WHO:** Als **DeFi-Nutzer**, der einem KI-Agenten Signing-Zugang gewährt hat und sich vor Fehlern,
Missverständnissen und Prompt-Injection schützen muss

**WHAT:** möchte ich, dass **jede schreibende oder geldbewegende Aktion** vor Ausführung in Klartext
zusammengefasst und von mir bestätigt wird, dass **Limits** (z. B. max. Betrag pro Aktion/pro
Zeitraum) greifen, dass ich Aktionen **simulieren** kann, und dass ein **Audit-Log** festhält, was
der Agent in meinem Namen getan hat

**WHY:** damit der Komfort der KI-Autonomie nicht zu unkontrolliertem Vermögensrisiko wird — und
damit euer Self-Custody-USP gewahrt bleibt

### Akzeptanzkriterien (Confirmation)

- [ ] **Jede** schreibende/signierende Aktion (Vault erstellen, Automation deployen, deposit/withdraw,
      activate/deactivate) erzeugt **vor Ausführung** eine **menschenlesbare Zusammenfassung** und
      erfordert eine **explizite Bestätigung**
- [ ] Es existieren **konfigurierbare Limits** (mind. Max-Betrag pro Withdraw/Deposit; optional pro
      Zeitfenster); Überschreitung blockiert die Aktion bzw. erfordert eine gesonderte Freigabe
- [ ] Der Nutzer kann eine schreibende Aktion **simulieren/„dry-run"** lassen (erwartetes Ergebnis,
      geschätzte Fees/Gas) **ohne** sie zu senden
- [ ] Ein **Audit-Log** erfasst pro Aktion: Zeitpunkt, Tool, Parameter, TX-Hash, Ergebnis — abrufbar
      durch den Nutzer
- [ ] Der Schutz ist **nicht durch reinen Prompt umgehbar** (Bestätigung/Limits sind serverseitig
      erzwungen, nicht nur LLM-Konvention)
- [ ] Lese-Tools (Story 2/3) sind **bestätigungsfrei** (keine Reibung ohne Risiko)
- [ ] Der Nutzer kann eine Art **„Read-only-Modus"** aktivieren, der alle schreibenden Tools
      deaktiviert

### INVEST-Check

| Kriterium | Erfüllt | Begründung |
|-----------|---------|------------|
| **I**ndependent | Teilweise | Als Mechanismus eigenständig baubar; entfaltet Wert im Verbund mit den schreibenden Stories (4–6). |
| **N**egotiable | Ja | Konkrete Limit-Arten, Default-Schwellen, Audit-Log-Tiefe sind verhandelbar. |
| **V**aluable | Ja | Ohne diese Story sind die schreibenden Stories nicht verantwortbar auslieferbar — direkter Vertrauens-/Sicherheitswert. |
| **E**stimable | Ja | Klar umrissene Querschnitts-Mechanik (Confirm-Gate, Limit-Check, Simulate, Log). |
| **S**mall | Teilweise | Vier Bausteine; ggf. „Bestätigung+Limits" zuerst, „Simulation+Audit-Log" als zweite Hälfte. |
| **T**estable | Ja | Erzwungene Bestätigung, Limit-Greifen, Dry-Run ohne TX, Log-Vollständigkeit, Prompt-Resistenz — prüfbar. |

> **Hinweis:** Diese Story sollte **gemeinsam mit Story 4 designt** und **vor/parallel zu 4–6
> umgesetzt** werden — sie ist deren Sicherheits-Gate, kein Anhang.

### Definition of Done

- [ ] Alle Akzeptanzkriterien sind getestet und erfüllt
- [ ] Code-Review durch mindestens 1 Entwickler erfolgt
- [ ] **Sicherheits-Review** inkl. Prompt-Injection-Szenario (LLM versucht, Bestätigung/Limit zu umgehen)
- [ ] Test: serverseitige Erzwingung (Limit/Confirm nicht per Prompt aushebelbar)
- [ ] Test: Read-only-Modus deaktiviert alle Schreib-Tools
- [ ] Keine offenen Blocker oder Abhängigkeiten

---

## Offene Entscheidungen (vor dem Refinement zu klären)

1. **Deployment-Modell (lokal vs. gehostet)** — bewusst offen gelassen. Trade-off:
   - **Lokal (stdio):** Key bleibt auf dem Rechner des Nutzers (Self-Custody-treu), kein zentraler
     Honeypot, aber pro Nutzer Setup-Aufwand und schwerer zu warten/aktualisieren.
   - **Gehostet (remote):** zentrales Setup, einfacher zu pflegen/erweitern — aber **Key/Signing-
     Vollmacht auf einem Server** widerspricht dem Self-Custody-USP massiv und schafft einen
     attraktiven Angriffspunkt. → **Empfehlung: lokal**, passend zum „Private Key in der Config"-Bild
     und zu eurem USP. Sollte vor Story 1 fixiert werden, da es deren Auth-/Key-Handling prägt.
2. **Wallet-Zugangs-Mechanismus** — roher Private Key (Beispiel) vs. verschlüsselter Keystore vs.
   externer Signer. Sicherheitsempfehlung: roher Key nur als Doku-Beispiel kennzeichnen, sicherere
   Variante als Standard anbieten.
3. **Umfang des Freiform-AI-Buildings (Story 5)** — MVP auf kuratierte Muster begrenzen? (empfohlen)

## Getroffene Entscheidungen

1. **Custody:** Server signiert selbst (Private Key) — bestätigt; Story 7 dadurch Pflicht.
2. **Umfang:** voller Lebenszyklus inkl. Geldbewegung — bestätigt.
3. **AI-Building:** Kern des MVP — bestätigt (Empfehlung: erste Iteration recipe-/musterbasiert).
