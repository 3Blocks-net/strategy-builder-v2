# Offene Punkte

Stand: 2026-09-04. Die vier Punkte aus dem alten Tracker wurden als GitHub-Issue
[#2](https://github.com/3Blocks-net/strategy-builder-v2/issues/2) aufgenommen und
bis auf einen erledigt. Was hier steht, ist der Rest.

## Offen: Branch-Schutz auf `main`

Die Regel ist entschieden (kein Force-Push, kein Löschen, PR-Pflicht ohne
Freigaben), aber nicht gesetzt: Der Zugang `Meiswinkel1991` hat am Repo nur
`push`/`triage`, nicht `admin`. Branch-Schutz verlangt Admin-Rechte, die REST-API
antwortet sonst mit 404.

**Was zu tun ist** — von jemandem mit Admin-Rechten, in der Oberfläche:
Repo → Settings → Branches → Add branch protection rule für `main`:

- [ ] Muster `main`
- [ ] „Allow force pushes" aus
- [ ] „Allow deletions" aus
- [ ] „Require a pull request before merging" an, erforderliche Freigaben: 0

Prüfung danach: `gh api repos/3Blocks-net/strategy-builder-v2/branches/main/protection`
antwortet mit 200.

Alternativ Admin-Rechte an den Zugang geben, dann setzt ein Agent die Regel per
API in einem Aufruf.

## Erledigt

- **Secret-Scan über die Git-History** (2026-09-04): 180 Commits, 50 Treffer, alle
  Fehlalarme — 44 EVM-Adressen, 6× der dokumentierte Hardhat-Standardschlüssel für
  Konto #0. Kein echtes Geheimnis wurde je committet, nichts zu rotieren.
  `.gitleaks.toml` erlaubt genau diese zwei Klassen; `gitleaks git --no-banner .`
  endet mit Exit 0.
- **Dev-Toolchain-CVEs** (2026-09-04): Entscheidung war „alles heben". Overrides in
  der Wurzel-`package.json`, Schwachstellen von 49 auf 4 gesenkt,
  `pnpm audit --prod` von 18 Funden auf Exit 0. Die vier verbliebenen stecken
  ausschließlich in Entwicklungswerkzeugen (`@nestjs/cli` → brace-expansion,
  `hardhat` → elliptic). Für elliptic existiert kein Patch.
- **Verwaiste Vaults nach Fork-Neustart** (2026-09-04): `VaultCodeService` prüft
  einmal pro Adresse per `eth_getCode` und meldet einen codelosen Vault genau
  einmal verständlich. Gas-Reserve- und Bewertungs-Pfad überspringen ihn.
