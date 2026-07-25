---
created: 2026-07-25
last_verified: 2026-07-25
git_commit: 7ca671beafc34c201d4980a6ef66297bec67aa7f
extrahiert: aus-bestandscode
---

# Problem Statement: Portfolio-Cockpit (Rekonstruktion aus Bestandscode)

> **Ehrlichkeits-Hinweis:** Dieses Dokument ist eine Reverse-Spec. Es wurde nachträglich
> aus dem Bestandscode abgeleitet (Backend: `packages/backend/src/{portfolio,cockpit,vault,tokens,indexer}`,
> Frontend: `packages/frontend/src/pages/{dashboard,vault}` + zugehörige Komponenten).
> Es beschreibt, was der Code **tatsächlich tut** — nicht, was ursprünglich geplant war.
> Ursprüngliche Motivation und Priorisierung sind rekonstruiert und im Zweifel Annahme.

## Problem

Ein Nutzer, der DeFi-Vaults mit automatisierten Strategien auf BSC betreibt, hat sein
Kapital über mehrere Orte verteilt: unallokierte ERC-20-Bestände im Vault, Positionen in
Protokollen (Aave V3 Supply/Borrow, PancakeSwap-V3-LPs), eine Gas-Reserve für
Automations-Ausführungen sowie eine Historie aus Ein-/Auszahlungen und
Strategie-Ausführungen. Ohne aggregierte Sicht müsste er Blockexplorer, Protokoll-UIs und
Preisquellen einzeln abfragen und könnte weder seinen Gesamtwert noch seine tatsächliche
Performance (Wertentwicklung bereinigt um eigene Ein-/Auszahlungen und Kosten) beurteilen.

## Wen betrifft es

Den per SIWE eingeloggten Vault-Besitzer (Self-Custody-Wallet-Nutzer). Jede Vault-Detail-
Sicht ist strikt auf den Eigentümer beschränkt — fremde Vaults sind für andere Nutzer
weder les- noch auffindbar (403/404, im Frontend Redirect zum Dashboard).

## Was der Bestandscode als Lösung liefert

1. **Dashboard-Übersicht**: alle registrierten Vaults des Nutzers mit Label,
   Deposit-Token und USD-Gesamtwert (Alchemy-Balances, DeFiLlama-Preis-Fallback).
2. **Vault-Detail-Cockpit**: Token-Positionen mit Preisquellen-Transparenz, eine
   protokollübergreifende Netto-Equity-Sicht (idle + Gas-Reserve + Protokoll-Adapter),
   Wertverlauf über die Zeit (stündliche Snapshots, 90 Tage Retention) mit
   Ein-/Auszahlungs-Markern, sowie flow-adjustierte PnL inkl. Kosten (Fees + Gas).
3. **Einheitliche Aktivitäts-Historie**: Ausführungen, Deposits/Withdraws und
   Fehlschläge in einer paginierten Tabelle, live per WebSocket aktualisiert mit
   Polling-Fallback.

## Kern-Invarianten, die der Code erzwingt

- **Keine Datenlecks über Vault-Grenzen**: ein zentraler Ownership-Check
  (`VaultAccessService`) für HTTP **und** WebSocket.
- **Eine Bewertungsquelle**: Header, Chart und PnL speisen sich aus demselben
  Bewertungs-/Snapshot-Lesemodell und können nicht auseinanderlaufen.
- **PnL-Firewall**: Nur Boundary-Events (Deposit/Withdraw) bewegen Netto-Einzahlungen;
  Protokoll-interne Flows fließen nie in die PnL ein.
- **Degradieren statt Ausfallen**: nicht bepreisbare Token, ausgefallene Preis-APIs,
  kaputte Protokoll-Adapter oder eine nicht erreichbare Chain führen zu leeren Listen,
  `null`-Werten oder Fehler-Zeilen — nie zum Totalausfall der Ansicht.
