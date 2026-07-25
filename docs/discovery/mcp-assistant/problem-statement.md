---
created: 2026-07-25
last_verified: 2026-07-25
git_commit: 7ca671beafc34c201d4980a6ef66297bec67aa7f
extrahiert: aus-bestandscode
---

# Problem Statement — mcp-assistant (Rekonstruktion aus Bestandscode)

> **Ehrlichkeits-Hinweis:** Dieses Dokument ist eine **Reverse-Spec**. Es wurde nachträglich aus dem Bestandscode (`packages/mcp/src`, Stand Commit `7ca671b`) und den zugehörigen Tests abgeleitet — nicht aus einer ursprünglichen Produktentscheidung. Die eingefrorenen Legacy-Specs unter `docs/legacy-specs/mcp-*` dienten als Gegenprobe; bei Abweichungen gilt das im Code beobachtbare Verhalten.

## Problem

Ein Self-Custody-Nutzer besitzt DeFi-Vaults (BSC) mit Automations, die er bisher nur über das Web-Frontend bedienen kann. Er möchte seine Vaults stattdessen im Dialog mit einem KI-Assistenten (z. B. Claude Desktop) verwalten: Bestände abfragen, Performance verstehen, Strategien bauen, Geld bewegen.

Das zentrale Spannungsfeld: Ein LLM soll **Transaktionen im Namen des Nutzers vorbereiten**, darf aber **niemals eigenmächtig signieren oder Geld bewegen** können — auch nicht bei Prompt-Injection, halluzinierten Adressen oder manipulierten Tool-Argumenten. Gleichzeitig darf der private Schlüssel den Rechner des Nutzers nie verlassen (Self-Custody).

## Gelöst wird das durch (beobachtbarer Contract)

- Einen **lokalen MCP-Server (stdio)**, der mit genau einer Owner-Wallet verbunden ist (verschlüsselter JSON-Keystore, Passwort im OS-Keychain via keytar) und sich per SIWE gegen das bestehende Backend authentifiziert.
- **Read-Tools** (Vaults, Portfolio, Positionen, Performance, Historie, Step-Katalog, Recipes), die strikt owner-isoliert sind.
- **Write-Tools** (Vault anlegen, Automation vorschlagen/deployen, Ein-/Auszahlen, Lifecycle), die durch einen server-erzwungenen **PolicyGate** laufen: sensible Aktionen erfordern eine explizite Nutzer-Bestätigung (MCP-Elicitation, Fallback lokale Bestätigungsseite), die das LLM nicht über Tool-Argumente fälschen kann.
- Zusätzliche server-seitige Leitplanken: Adress-Allowlist für Geld-Ziele, Capability-Opt-in für sensible Step-Types, Max-Betrag pro Token, Vault-Ownership-Check vor jeder Signatur, Intent-Cross-Check gegen den server-decodierten Graphen, unveränderlicher Draft zwischen `propose` und `deploy`.
- Ein **append-only Audit-Log** aller schreibenden Aktionen und ein **Init-CLI** mit Verify-before-store-Onboarding und Widerrufspfad (`--remove`).

## Wert (implizit aus dem Code ableitbar)

Der Nutzer bekommt KI-gestützte Vault-Verwaltung, ohne Custody, Kontrolle oder Nachvollziehbarkeit aufzugeben: Jede geldbewegende Aktion ist einzeln bestätigt, limitiert, allowlist-gebunden und lokal auditierbar; der Zugang ist jederzeit lokal entziehbar.
