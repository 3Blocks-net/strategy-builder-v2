---
id: TASK-12
title: Absicherungs-Paket
status: Needs Triage
assignee: []
created_date: '2026-07-27 14:42'
labels:
  - prd
  - ready-for-agent
dependencies: []
ordinal: 12000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
---
created: 2026-07-27
last_verified: 2026-07-27
git_commit: bd2b11fc119c35fdbdbf9ab0e6943a7b721e78a6
ticket: <wird bei Publikation gefüllt>
---

# PRD: Absicherungs-Paket

Epic: `docs/discovery/absicherungs-paket/epic.md` (v2, eingefroren, Freeze-Commit `bd2b11f`).

## Problem Statement

Als Vault-Owner kann ich heute Strategien deployen, deren Swaps ohne Slippage-Schutz laufen —
ein Sandwich-Angriff oder dünner Pool kann mich beliebig viel kosten. Außerdem akzeptiert mein
Vault jedes beliebige delegatecall-Target als Action: Ein einziger bösartiger Step könnte
meinen gesamten Vault-Storage inklusive Ownership übernehmen. Ich habe keine Möglichkeit,
diese Risiken vor dem Deploy zu erkennen oder zu begrenzen.

## Lösung

Standard-Deploys sind strukturell geschützt: Jeder Swap-Step trägt eine Pflicht-Toleranz, die
on-chain als minOut gegen den Pool-TWAP erzwungen wird; deploybar sind im Standard-Modus nur
kuratierte Actions/Conditions (On-Chain-Registry, Kurator-Rolle); wer mehr will, aktiviert pro
Vault einen ausdrücklichen Experten-Modus. Vor dem Deploy zeigt eine Preis-Schock-Preview, wie
sich die Strategie bei ±10/20/50 % Preisbewegung rechnerisch verhält. Das Cockpit zeigt den
Schutz-Status pro Vault.

## Story-Sektion

**On-Chain (Contracts):**

**S1 (→ A2): Als Kurator möchte ich Actions/Conditions on-chain als kuratiert führen, damit der Schutz-Standard zentral gepflegt ist.**
- [ ] Eine CuratedRegistry verwaltet kuratierte Target-Adressen; nur die Kurator-Rolle (eigene, vom Registry-Owner austauschbare Rolle) darf aufnehmen/entfernen.
- [ ] Jede Änderung emittiert ein Event (Adresse, Aktion, Kurator).
- [ ] Entfernen wirkt ausschließlich auf neue Deploys — laufende Automationen bleiben unberührt.
- [ ] Abfrage `istKuratiert(address)` ist als View für Vault, Backend und Tests nutzbar.

**S2 (→ A2): Als Standard-Vault-Owner möchte ich, dass mein Vault beim Anlegen einer Automation unkuratierte Targets ablehnt, damit bösartige Actions strukturell ausgeschlossen sind.**
- [ ] `createAutomation` (und Steps-Update) revertiert im Standard-Modus mit klarem Fehler, wenn ein Step-Target nicht kuratiert ist.
- [ ] Kuratierte Deploys verhalten sich unverändert (bestehende Fork-Tests bleiben grün).
- [ ] Der Check greift auch bei direktem Contract-Call (nicht nur über das UI).
- [ ] Bereits angelegte Automationen laufen weiter, auch wenn ein Target später entkuratiert wird.

**S3 (→ A3): Als Experten-Owner möchte ich pro Vault einen Experten-Modus aktivieren können, damit ich weiterhin beliebige Targets nutzen kann.**
- [ ] Nur der Vault-Owner kann das Experten-Flag setzen/entfernen; jede Änderung emittiert ein Event.
- [ ] Bei aktivem Flag entfällt das Kuratierungs-Gate aus S2 für diesen Vault.
- [ ] Das Flag ist on-chain abfragbar (Grundlage für Badge/S10).

**S4 (→ A1): Als Vault-Owner möchte ich, dass jeder Pancake-Swap-Step meine Toleranz als minOut gegen den Pool-TWAP erzwingt, damit Slippage-Verluste begrenzt sind.**
- [ ] Die Swap-Action nimmt eine Toleranz (bps) als Step-Parameter; Grenzen werden on-chain validiert.
- [ ] Zur Ausführungszeit: erwarteter Output aus Pool-TWAP (konfigurierbares Fenster) → minOut = Erwartung × (1 − Toleranz); Unterschreitung revertiert mit klarem Fehler.
- [ ] TWAP nicht verfügbar (observe schlägt fehl / Cardinality fehlt) → Fallback: Spot-Preis mit halbierter Toleranz; der Fallback-Einsatz ist im Event erkennbar.
- [ ] Grenzfälle getestet: exakt am minOut, Toleranz-Min/Max, Fallback-Pfad.

**S5 (→ A1): Als Vault-Owner möchte ich, dass auch SwapToRangeRatio (und jede weitere swappende Action) denselben Slippage-Schutz nutzt, damit es keinen ungeschützten Swap-Pfad mehr gibt.**
- [ ] SwapToRangeRatio übernimmt Toleranz-Parameter + TWAP-minOut-Mechanik aus S4 (eine geteilte Implementierung, keine Kopie).
- [ ] Inventur belegt: Nach diesem Epic existiert im Katalog keine swappende Action ohne minOut-Pfad.

**Katalog & geteilte Regeln:**

**S6 (→ A1): Als Nutzer möchte ich die Toleranz im Editor als verständliches Pflichtfeld mit sicherem Default setzen, damit ich den Schutz ohne Detailwissen nutze.**
- [ ] paramSchema der Swap-Steps erhält das Toleranz-Feld (Default 0,5–1 %, Min/Max identisch zu on-chain) mit passender x-ui-Semantik.
- [ ] validateParams (friendly + raw) prüft dieselben Grenzen — Editor, Backend-Guard und MCP über die eine geteilte Quelle.
- [ ] Der Katalog-Integritäts-Guard (ABI↔Schema-Lockstep) bleibt grün.

**S7 (→ A2): Als Betreiber möchte ich, dass der Fork-Deploy alle Katalog-Actions automatisch kuratiert, damit die lokale Entwicklung dem Ziel-Zustand entspricht.**
- [ ] deploy-fork deployt die CuratedRegistry und registriert alle deployten Katalog-Actions/-Conditions als kuratiert.
- [ ] Der Seed validiert wie bisher gegen den deployten Katalog; ein unkuratierter Katalog-Eintrag fällt im Seed auf (Warnung).

**Frontend:**

**S8 (→ A4): Als Vault-Owner möchte ich vor dem Deploy eine Preis-Schock-Preview sehen, damit ich das Risiko der Strategie einschätzen kann.**
- [ ] Der Deploy-Dialog zeigt für Steps mit Preis-Exposure (Swaps, LP-Ranges, Lending-HF) die rechnerische Auswirkung von ±10/20/50 % Preisbewegung.
- [ ] Berechnung rein clientseitig aus vorhandenen Daten (Positionen/Preise des Cockpit-Pfads); fehlender Preis → „Preview nicht verfügbar", nie Deploy-Blockade.
- [ ] Bei sehr illiquiden Pools/hoher Toleranz erscheint eine Warnung.

**S9 (→ A3): Als Experten-Owner möchte ich den Experten-Modus im UI mit ausdrücklicher Warnbestätigung aktivieren, damit die Entscheidung bewusst fällt.**
- [ ] Toggle pro Vault; Aktivierung nur nach Warn-Dialog mit expliziter Bestätigungs-Interaktion (kein vorausgewähltes Häkchen).
- [ ] Aktueller Modus ist am Vault sichtbar; Deaktivierung jederzeit möglich (wirkt auf neue Deploys).

**S10 (→ A6, Kann): Als Vault-Owner möchte ich im Cockpit einen Schutz-Status-Badge sehen, damit der Schutz sichtbar ist.**
- [ ] Badge „Geschützt" / „Experten-Modus" pro Vault, abgeleitet aus dem On-Chain-Flag (S3) über den bestehenden Cockpit-Pfad.
- [ ] Unklarer Zustand → konservativste Anzeige.

**Assistent & Durchstich:**

**S11 (→ A2/A1): Als Betreiber möchte ich belegt haben, dass der KI-Assistent dieselben Schutzregeln erbt, damit kein Umgehungspfad existiert.**
- [ ] MCP propose/deploy lehnt Toleranz-Verstöße und unkuratierte Targets mit derselben Regelquelle ab (Katalog/shared) — per Test belegt, ohne MCP-Sonderlogik.

**S12: Als Betreiber möchte ich einen Fork-Durchstich, damit das Paket end-to-end belegt ist.**
- [ ] Fork-Szenario: kuratierte Automation mit Swap+Toleranz deployt und führt aus; unkuratierter Deploy revertiert im Standard-Modus und gelingt im Experten-Modus; minOut-Verletzung revertiert.

## Umsetzungsentscheidungen

- **Whitelist-Gate im bestehenden Vault-Contract** (Produkt nicht live, Deployments frei
  änderbar — Epic v2): Prüfung bei `createAutomation`/Steps-Update gegen die CuratedRegistry;
  kein Versionierungs-/Migrationspfad.
- **CuratedRegistry als eigener Contract** mit eigener Kurator-Rolle (Muster: bestehende
  Rollen-Trennung wie discountSetter im Fee-Entwurf); Entfernen wirkt nie auf laufende
  Automationen.
- **Experten-Modus als On-Chain-Flag pro Vault**, nur vom Owner setzbar, mit Event.
- **Slippage-Mechanik:** Toleranz (bps) als Step-Parameter; Referenz = Pool-TWAP zur
  Ausführungszeit (Fenster konfigurierbar, Muster: bestehende observe()-Nutzung);
  **Fallback bei nicht verfügbarem TWAP: Spot-Preis mit halbierter Toleranz** — bewusster
  Verfügbarkeits-Trade-off (Fallback-Einsatz im Event sichtbar). Geteilte Implementierung
  für alle swappenden Actions (Library statt Kopie).
- **Eine Regelquelle:** Toleranz-Grenzen/Defaults leben im paramSchema + shared-Validierung;
  Editor, Backend-Guard und MCP erben sie — keine Zweitimplementierung (Encode-Boundary-Prinzip).
- **Preis-Schock-Preview clientseitig** aus vorhandenen Cockpit-Daten; kein neuer Endpoint.
- **Kuratierungs-Betrieb:** Aufnahme nur nach Code-Review + Fork-Tests durch das 3Blocks-Team
  (Prozess-Zusage aus dem Epic; on-chain nur die Rolle, kein Governance-Mechanismus).

## Test-Entscheidungen

- Nur beobachtbares Verhalten über öffentliche Schnittstellen; Mocks nur an Systemgrenzen
  (Provider/Preise). Kein Test gegen Implementierungsdetails.
- **Contracts:** Hardhat-Fork-Tests nach bestehendem Muster (Vorbild: vorhandene
  Action-/Condition-Fork-Tests, WickWait-TWAP-Tests für observe-Randfälle) — Gate-Reverts,
  minOut-Grenzfälle, Fallback-Pfad, Rollen-Checks, Events.
- **shared:** Vitest auf validateParams/Encode-Boundary (friendly/raw, Grenzen, Defaults) —
  Vorbild: bestehende encode-boundary-/validation-Tests.
- **Backend:** Jest auf Katalog-Integrität (Lockstep-Guard) und Cockpit-Schutz-Status;
  Vorbild: bestehende catalog-/cockpit-Specs.
- **Frontend:** Vitest auf Preview-Berechnung (reine Funktion + Degradierung) und
  Experten-Dialog-Verhalten; Vorbild: bestehende Komponenten-Tests.
- **Durchstich:** ein Fork-Szenario (S12) als Integrationsbeleg.

## Out of Scope

- Bestands-Kennzeichnung/Migrations-Mechanik (ex-A5) — erst mit Mainnet-Launch (v-next).
- Panik-Withdraw, Dry-Run/Backtesting, Stop-Loss-/HF-Wächter-Steps (Epic E), DAO-Kuratierung,
  zusätzliche MCP-PolicyGate-Sonderhärtung — alles v-next laut Epic.

## Annahmen & offene Fragen (Pflicht-Durchreiche)

1. *(aufgelöst, Epic v2):* Whitelist-Check direkt im bestehenden Vault-Contract — kein
   V2-Versionierungs-Weg, da Produkt nicht live und Deployments frei änderbar.
2. *(aufgelöst, Epic v2):* minOut-Referenz = Pool-TWAP zur Ausführungszeit; Fallback
   Spot-Preis mit halbierter Toleranz. Bewusster Trade-off: Verfügbarkeit vor maximaler
   Manipulationsresistenz im Fallback-Pfad.
3. Annahme: Produkt bleibt bis zum Abschluss dieses Epics nicht live auf Mainnet —
   Contract-Änderungen ohne Migrationspfad sind zulässig.
4. Annahme: Kuratierungs-Prozess (Review + Fork-Tests) ist mit Solo-/Kleinteam-Kapazität
   leistbar; Durchlaufzeit pro neuer Action unkritisch in H1.

## Weitere Hinweise

- Audit-Scope Ende H1 (Produkt-Analyse, Entscheidung 7): Vault-Kern + dieses Paket + S1/S2
  des Fee-Epics — die hier gebauten Pfade sind Audit-Gegenstand; Fork-Testabdeckung
  entsprechend ernst nehmen.
- Der Fee-Entwurf (ENG-48) führt später eine discountSetter-Rolle ein — Kurator-Rolle hier
  analog schneiden, damit die Rollen-Landschaft konsistent bleibt.

---
PRD-Quelle: docs/prd/absicherungs-paket.md · Epic: TASK-11 (v2, Freeze bd2b11f)
<!-- SECTION:DESCRIPTION:END -->
