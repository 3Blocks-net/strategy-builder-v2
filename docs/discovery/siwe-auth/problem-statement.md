---
created: 2026-07-25
last_verified: 2026-07-25
git_commit: 7ca671beafc34c201d4980a6ef66297bec67aa7f
extrahiert: aus-bestandscode
---

# Problem Statement: SIWE-Auth (Sign-In with Ethereum)

> **Hinweis zur Herkunft:** Dieses Dokument ist eine **Rekonstruktion aus Bestandscode** (Reverse-Spec), keine ursprüngliche Discovery. Es beschreibt den Black-Box-Contract, den der Code zum Stand des oben genannten Commits tatsächlich erzwingt — nicht zwingend die ursprüngliche Produktabsicht.

## Problem

Pecunity ist eine Self-Custody-DeFi-Anwendung: Nutzer besitzen ausschließlich eine Wallet, kein klassisches Konto. Ein Passwort-Login wäre ein Fremdkörper (zweites Geheimnis, Reset-Flows, Phishing-Fläche) und würde dem Self-Custody-Prinzip widersprechen — die Wallet **ist** die Identität.

Das Backend muss aber wissen, *welche* Wallet einen Request stellt, um nutzerbezogene Daten (Strategien, Vaults) zuzuordnen und zu schützen. Eine reine On-Chain-Signatur pro Request wäre für den Nutzer unzumutbar (Signatur-Popup bei jedem Klick).

## Gewählte Lösung (aus dem Code abgelesen)

Sign-In with Ethereum (EIP-4361): Der Nutzer beweist einmalig per Wallet-Signatur über eine server-ausgegebene, einmalig verwendbare Nonce, dass er den Private Key zur Adresse kontrolliert. Das Backend tauscht diesen Beweis gegen ein kurzlebiges JWT-Access-Token (15 min) plus ein langlebiges Refresh-Token (7 Tage), sodass Folge-Requests ohne weitere Signaturen auskommen. Replay-Schutz über Single-Use-Nonces mit TTL (300 s), Phishing-Schutz über Domain-Bindung der SIWE-Message an die konfigurierte `FRONTEND_URL`.

Konsumenten des Contracts sind das Frontend (wagmi/viem-Wallet-Connect + SIWE-Signatur im Browser) und der MCP-Server (`packages/mcp/src/auth-client.ts`, serverseitiger Handshake mit lokalem Keystore-Signer).

## Erfolgskriterien (implizit, aus Tests abgeleitet)

- Login ausschließlich per Wallet-Signatur, kein Passwort, keine E-Mail.
- Abgelaufene, unbekannte oder wiederverwendete Nonces werden abgelehnt (`NONCE_INVALID`).
- Falsche Domain oder ungültige Signatur werden abgelehnt (`SIGNATURE_INVALID`).
- Access-Token-Ablauf führt im Frontend zu transparentem Silent-Refresh statt erneutem Signieren; erst wenn auch der Refresh scheitert, landet der Nutzer wieder auf dem Connect-Screen.
- Refresh-Tokens werden serverseitig nur als SHA-256-Hash gespeichert.
