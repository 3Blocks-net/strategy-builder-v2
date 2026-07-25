# Triage-Labels

Die Skills sprechen in Begriffen von fünf kanonischen Triage-Rollen. Diese Datei ordnet diese
Rollen den tatsächlichen Label-Strings in diesem Repo zu.

| Label bei shipcraft      | Label in unserem Tracker | Bedeutung                                |
| ------------------------ | ------------------------ | ----------------------------------------- |
| `needs-triage`            | `needs-triage`            | Maintainer muss dieses Issue bewerten     |
| `needs-info`               | `needs-info`               | Wartet auf weitere Infos vom Melder       |
| `ready-for-agent`          | `ready-for-agent`          | Vollständig spezifiziert, bereit für einen AFK-Agenten |
| `ready-for-human`          | `ready-for-human`          | Braucht menschliche Umsetzung             |
| `wontfix`                  | `wontfix`                  | Wird nicht umgesetzt                      |

## Rollen und Status — ein Vokabular, zwei Ausprägungen

Die sechs Workflow-Status (`Needs Triage`, `Ready for Agent`, `In Progress`, `Needs Info`,
`In Review`, `Done`) sind die kanonische Achse für den Zustand eines Tickets. Drei der fünf
Triage-Rollen sind schlicht deren Label-Schreibweise für Tracker ohne echtes Status-Feld:
`needs-triage` ↔ Needs Triage, `needs-info` ↔ Needs Info, `ready-for-agent` ↔ Ready for
Agent (die Mapping-Tabellen in den Tracker-Seeds sind die verbindliche Übersetzung).
Die übrigen zwei sind **Routing-Labels ohne Status-Zwilling**: `ready-for-human`
(vollständig spezifiziert, aber ein Mensch setzt um — der Status bleibt der normale
Workflow) und `wontfix` (Terminal-Entscheidung — als Label/Archiv, nie als siebter Status).

Erwähnt ein Skill eine Rolle (z. B. „setze das AFK-bereit-Triage-Label"), nutze den
entsprechenden Label-String aus dieser Tabelle.

Bearbeite die rechte Spalte, damit sie zu deinem tatsächlich genutzten Vokabular passt.
