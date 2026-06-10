# Geldbewegung (6a): `deposit` / `withdraw` + Schutzschichten

## Parent PRD

mcp-integration.md

## What to build

Der Nutzer bewegt per Chat Geld in/aus dem Vault — mit allen server-erzwungenen
Schutzschichten aus Story 7. `deposit` (Token + Betrag) und `withdraw` (Token + Betrag +
Empfänger); Beträge werden korrekt in Base-Units konvertiert (Token-Decimals).

- **Confirm-Gate** (PolicyGate, Slice 06) für jede geldbewegende Aktion, mit aus der
  kanonischen TX dekodierter Klartext-Summary (Betrag, Token, Empfänger).
- **Adress-Allowlist:** der `withdraw`-Empfänger darf **nur** eine Allowlist-Adresse sein
  (Owner + bewusst eingetragene Ziele); sonst **Ablehnung**.
- **Max-Betrag pro Aktion** (pro Token, aus Config) → Überschreitung blockiert/erfordert
  gesonderte Freigabe. **Read-only-Modus** (Config-Flag) deaktiviert alle write/signing-Tools.
- **`Simulator`:** Dry-Run via viem `simulateContract`/`estimateGas` — erwartetes Ergebnis
  + geschätzte Fees/Gas, ohne zu senden (nur Geldbewegung).
- Anfallende **Fees** (Deposit/Withdraw-BPS) werden **vor** der Bestätigung transparent
  gemacht; Revert → dekodierte Fehlermeldung, kein stiller Teilerfolg.

Siehe PRD _Geld bewegen & Lifecycle (Story 6)_ und _Schutzmechanismen (Story 7)_.

## Acceptance criteria

- [ ] `deposit`/`withdraw` konvertieren Beträge korrekt in Base-Units (Token-Decimals) und laufen über das Confirm-Gate mit dekodierter Summary.
- [ ] Adress-Allowlist: Withdraw-Empfänger außerhalb der Allowlist → **Ablehnung** (Verhaltenstest).
- [ ] Max-Betrag-Limit greift (Überschreitung blockiert/erfordert gesonderte Freigabe); Read-only-Modus deaktiviert alle Write-Tools (Verhaltenstests).
- [ ] `Simulator` liefert für deposit/withdraw erwartetes Ergebnis + Fees/Gas ohne zu senden.
- [ ] Fees werden vor der Bestätigung transparent gemacht; Revert → dekodierte Fehlermeldung.

## Blocked by

- Blocked by #06

## User stories addressed

- User story 39
- User story 42
- User story 43
- User story 44
- User story 45
- User story 50
- User story 51
- User story 52
- User story 53
