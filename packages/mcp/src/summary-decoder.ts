import {
  resolveFieldRole,
  fromBaseUnits,
  findUnannotatedRecipients,
  type RawGraph,
  type StepSchema,
  type FieldSchema,
} from 'shared';

/** Katalog-Eintrag pro Step-Type-ID (Name + Schema mit Rollen-Annotationen). */
export type CatalogStep = StepSchema & { name: string };
export type DecoderCatalog = Record<string, CatalogStep>;

export interface DecodedStep {
  stepType: string;
  category: 'CONDITION' | 'ACTION';
  token?: string;
  /** Betrag human-readable (Base-Units → über Token-Decimals umgerechnet). */
  amount?: string;
  amountRaw?: string;
  recipient?: string;
  direction?: string | number;
}

export interface DecodedSummary {
  steps: DecodedStep[];
  execution?: 'public' | 'owner';
  warnings: string[];
}

/**
 * Schema-getriebener Decoder: rekonstruiert aus dem **raw graph** + Katalog
 * (mit Rollen-Annotationen) + Token-Decimals eine strukturierte, menschenlesbare
 * Zusammenfassung. Gemeinsame Quelle für (1) die Confirm-Summary und (2) den
 * decodierten Graphen, gegen den der Intent gediffт wird (Slice 8).
 *
 * Kein per-step-type-Code: Token/Betrag/Empfänger/Richtung werden ausschließlich
 * über `resolveFieldRole` (x-ui-role / x-ui-widget) bestimmt. Ein Geld-Ziel-Feld
 * ohne recipient-Rolle bzw. ein Betrag ohne auflösbare Decimals wird **markiert**
 * (Warnung), nie still weggelassen.
 */
export function decodeRawGraph(
  graph: RawGraph,
  catalog: DecoderCatalog,
  tokenDecimals: Record<string, number>,
  execution?: 'public' | 'owner',
): DecodedSummary {
  const steps: DecodedStep[] = [];
  const warnings: string[] = [];

  for (const node of graph.nodes) {
    const step = catalog[node.data.stepTypeId];
    if (!step) {
      warnings.push(`Unbekannte Step-Type-ID "${node.data.stepTypeId}" — nicht decodierbar.`);
      continue;
    }

    const properties = step.paramSchema?.properties ?? {};
    const params = node.data.params ?? {};
    const decoded: DecodedStep = { stepType: step.name, category: node.type };

    // Felder schema-getrieben nach Rolle auflösen.
    let amountField: string | undefined;
    let amountFieldSchema: FieldSchema | undefined;
    let firstTokenValue: string | undefined;

    for (const [field, fieldSchema] of Object.entries(properties)) {
      const role = resolveFieldRole(fieldSchema);
      const raw = params[field];
      if (role === 'token' && firstTokenValue === undefined && raw !== undefined) {
        firstTokenValue = String(raw);
      } else if (role === 'recipient' && raw !== undefined) {
        decoded.recipient = String(raw);
      } else if (role === 'direction' && raw !== undefined) {
        decoded.direction = raw as string | number;
      } else if (role === 'amount') {
        amountField = field;
        amountFieldSchema = fieldSchema;
      }
    }

    // Betrag: Token-Decimals über das annotierte Token-Feld auflösen.
    if (amountField !== undefined) {
      const rawAmount = params[amountField];
      const tokenField = amountFieldSchema?.['x-ui-amount-token-field'] as string | undefined;
      const tokenAddr = tokenField ? params[tokenField] : firstTokenValue;
      decoded.token = tokenAddr !== undefined ? String(tokenAddr) : firstTokenValue;
      if (rawAmount !== undefined) {
        decoded.amountRaw = String(rawAmount);
        const dec =
          typeof tokenAddr === 'string' ? tokenDecimals[tokenAddr.toLowerCase()] : undefined;
        if (dec === undefined) {
          warnings.push(
            `${step.name}: Betrag nicht decodierbar — unbekannte Decimals für Token ${String(tokenAddr)}.`,
          );
        } else {
          decoded.amount = fromBaseUnits(String(rawAmount), dec);
        }
      }
    }
    if (decoded.token === undefined && firstTokenValue !== undefined) {
      decoded.token = firstTokenValue;
    }

    steps.push(decoded);
  }

  // Mindest-Annotations-Pass: Geld-Ziel-Felder ohne recipient-Rolle markieren.
  const referencedSteps = graph.nodes
    .map((n) => catalog[n.data.stepTypeId])
    .filter((s): s is CatalogStep => Boolean(s));
  for (const gap of findUnannotatedRecipients(referencedSteps)) {
    warnings.push(
      `${gap.step}: Empfänger-Feld "${gap.field}" ohne recipient-Rolle — für Decoder/Allowlist unsichtbar.`,
    );
  }

  return { steps, execution, warnings };
}
