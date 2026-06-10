# `SummaryDecoder` (schema-getriebenes Decode-Modul)

## Parent PRD

mcp-integration.md

## What to build

Das Herzstück hinter „was du liest, ist was signiert wird": ein reines, schema-getriebenes
Modul, das aus einer **kanonischen TX / einem raw graph** eine menschenlesbare,
**strukturierte** Zusammenfassung rekonstruiert (Funktion, Token, Betrag Base-Units→human,
Empfänger, Richtung, Trigger, `execution`-Modus). Es ist die gemeinsame Quelle für **(1)**
die Confirm-Summary und **(2)** den decodierten Graphen, gegen den später (Slice 08) der
Intent gediffт wird.

Schema-getrieben: die pro Step nötige Semantik kommt aus den **`x-ui-widget`/Rollen-
Annotationen** im `paramSchema` (kein per-step-type-Code). Rein, deterministisch, table-
driven testbar — kein LLM, keine Chain, kein Signieren. Siehe PRD _Calldata-/Graph-Decoder_.

## Acceptance criteria

- [ ] `SummaryDecoder` erzeugt aus einem raw graph / Calldata eine strukturierte Summary (Funktion, Token, human-Betrag, Empfänger, Richtung, Trigger, `execution`) — table-driven getestet.
- [ ] Decode ist **schema-getrieben** aus den Rollen-Annotationen; ein neuer annotierter Step erfordert **keinen** Decoder-Code.
- [ ] Beweis-Test: ein **manipulierter** raw graph erzeugt eine entsprechend **abweichende** Summary (die Summary stammt aus der TX, nicht aus separaten Tool-Args).
- [ ] Ein Step **ohne** Rollen-Annotation am Empfänger-/Betrag-Feld lässt den Decode für dieses Feld **fehlschlagen/markieren** (kein stilles Weglassen).
- [ ] Base-Units → human-Beträge nutzen die korrekten Token-Decimals.

## Blocked by

- Blocked by #04

## User stories addressed

- User story 33
- User story 47
