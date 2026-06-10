## ADDED Requirements

### Requirement: Schema-getriebene Decode aus der kanonischen TX

Das System SHALL ein reines, schema-getriebenes `SummaryDecoder`-Modul bereitstellen, das aus einer kanonischen TX / einem raw graph eine strukturierte, menschenlesbare Zusammenfassung rekonstruiert (Funktion, Token, Betrag Base-Units→human, Empfänger, Richtung, Trigger, `execution`-Modus). Die pro Step nötige Semantik SHALL aus den `x-ui-widget`/Rollen-Annotationen im `paramSchema` gelesen werden (kein per-step-type-Code). Das Modul SHALL die gemeinsame Quelle für die Confirm-Summary und den decodierten Graphen (für den Intent-Diff) sein.

#### Scenario: Strukturierte Summary aus raw graph

- **WHEN** ein raw graph / Calldata an den `SummaryDecoder` gegeben wird
- **THEN** erzeugt er eine strukturierte Summary (Funktion, Token, human-Betrag, Empfänger, Richtung, Trigger, `execution`)

#### Scenario: Neuer annotierter Step ohne Decoder-Code

- **WHEN** ein neuer Step mit Rollen-Annotationen hinzukommt
- **THEN** wird er vom `SummaryDecoder` ohne zusätzlichen step-type-spezifischen Code decodiert

### Requirement: Summary stammt aus der TX, nicht aus Tool-Args

Das System SHALL sicherstellen, dass ein manipulierter raw graph eine entsprechend abweichende Summary erzeugt (Beweis, dass die Summary aus der TX und nicht aus separaten Tool-Argumenten stammt). Base-Units → human-Beträge SHALL die korrekten Token-Decimals nutzen.

#### Scenario: Manipulierter Graph → abweichende Summary

- **WHEN** der raw graph manipuliert wird
- **THEN** weicht die erzeugte Summary entsprechend ab

#### Scenario: Fehlende Annotation am sensiblen Feld

- **WHEN** ein Step keine Rollen-Annotation am Empfänger-/Betrag-Feld hat
- **THEN** schlägt der Decode für dieses Feld fehl bzw. markiert es (kein stilles Weglassen)
