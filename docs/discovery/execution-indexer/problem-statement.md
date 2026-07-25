---
created: 2026-07-25
last_verified: 2026-07-25
git_commit: 7ca671beafc34c201d4980a6ef66297bec67aa7f
extrahiert: aus-bestandscode
---

# Problem-Statement: execution-indexer (Rekonstruktion aus Bestandscode)

> **Hinweis:** Dieses Dokument ist eine nachträgliche Rekonstruktion des fachlichen Problems aus dem vorhandenen Code (`packages/backend/src/indexer`, `packages/backend/src/blockchain`, `packages/backend/.env.example`). Es beschreibt, welches Problem der Code beobachtbar löst — nicht, was ursprünglich geplant war.

## Problem

Vault-Besitzer sehen ohne serverseitige Indizierung nicht, was mit ihren Automationen auf der Chain tatsächlich passiert: erfolgreiche Ausführungen und Ein-/Auszahlungen existieren nur als On-Chain-Logs, und **fehlgeschlagene** Ausführungen hinterlassen gar keine Logs (Reverts emittieren keine Events). Eine rein clientseitige Abfrage wäre langsam, lückenhaft nach Reconnects, nicht reorg-sicher und könnte Fehlschläge prinzipiell nicht darstellen.

## Wen betrifft es

- **Vault-Besitzer** (Frontend-Nutzer): wollen eine vollständige, aktuelle Historie pro Vault — Erfolge, Deposits/Withdraws und Fehlschläge inkl. verständlicher Fehlermeldung — sowie eine ehrliche Frische-Anzeige („wie aktuell ist der Index?").
- **Keeper** (externer Ausführungs-Bot): braucht einen Kanal, um Reverts (Ausführung oder Trigger-Check) an das Backend zu melden, da die Chain sie nicht überliefert.
- **Betreiber/Entwickler**: brauchen einen Indexer, der Backend-Neustarts, RPC-Limits (BSC-Public-RPC-Fenstergrenzen) und den lokalen Hardhat-Fork (keine Reorgs, idle Chain) übersteht, ohne die API zu destabilisieren.

## Beobachtbare Lösung im Bestand

Ein In-Process-Poll-Indexer im NestJS-Backend liest `AutomationExecuted`/`GasCompSettled`/`Deposited`/`Withdrawn` über eine adresslose `getLogs`-Abfrage, persistiert idempotent (Unique auf `(txHash, logIndex)`) mit Confirmation-Tiefe gegen Reorgs, führt einen durablen Cursor in der DB und friert USD-Werte zum Schreibzeitpunkt ein. Keeper-Fehlschläge kommen über `POST /internal/executions/failures` herein, geschützt durch ein Shared-Secret (`x-keeper-secret`), das **fail-closed** ist: ohne konfiguriertes `KEEPER_INGEST_SECRET` lehnt der Endpunkt alles ab. Erfolge lösen offene Fehlschläge derselben Automation transaktional auf; das Frontend erhält neue Erfolge zusätzlich in Echtzeit per abgesichertem WebSocket.

## Erfolgsindikatoren (aus dem Code ableitbar)

- Jede erfolgreiche Ausführung und jeder Deposit/Withdraw landet genau einmal in der DB — auch nach Neustart, Cursor-Resume oder doppelter Verarbeitung.
- Auf Mainnet werden nur Blöcke `<= head − INDEXER_CONFIRMATIONS` indiziert (Reorg-Sicherheit); auf dem Fork funktioniert `INDEXER_CONFIRMATIONS=0`, weil eine idle Chain sonst nie „bestätigt".
- RPC-Range-Fehler führen nicht zu Datenlücken, sondern zu adaptivem Halbieren des Blockfensters.
- Kein Unbefugter kann Fehlschlag-Zeilen injizieren; ohne Server-Secret ist der Ingest komplett zu.
