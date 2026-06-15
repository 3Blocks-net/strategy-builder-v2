/**
 * Schema-getriebene Rollen-Auflösung über die StepType-Annotationen.
 *
 * Liefert die gemeinsame Quelle für den `SummaryDecoder` (Confirm/Intent-Diff)
 * und den Adress-Allowlist-Guard: welches Feld trägt Token / Betrag / Empfänger
 * / Richtung — ohne per-step-type-Code. Eine Rolle ist entweder **explizit**
 * (`x-ui-role`) oder wird aus dem `x-ui-widget` **abgeleitet**.
 */
import type { FieldSchema, ParamSchema } from './validation';
import type { AbiFragment } from './encode-boundary';

export type FieldRole = 'token' | 'amount' | 'recipient' | 'direction';

const FIELD_ROLES: readonly FieldRole[] = ['token', 'amount', 'recipient', 'direction'];

/**
 * Ableitung der Rolle aus dem UI-Widget, wenn keine explizite Rolle gesetzt ist.
 * Bewusst NICHT `account-selector` → das Widget bezeichnet auch reine Watch-/
 * Lese-Adressen (z. B. TokenBalanceCondition.account), die KEIN Geld-Ziel sind.
 * Ein echtes Geld-Ziel muss explizit `x-ui-role: 'recipient'` tragen.
 */
const WIDGET_ROLE: Record<string, FieldRole> = {
  'token-selector': 'token',
  'token-amount': 'amount',
  'aave-amount-mode': 'direction',
};

/** Felder, die on-chain ein Geld-Ziel sind (müssen als `recipient` markiert sein). */
const RECIPIENT_FIELD_NAMES = new Set(['recipient', 'to', 'receiver', 'destination']);

function isFieldRole(value: unknown): value is FieldRole {
  return typeof value === 'string' && (FIELD_ROLES as readonly string[]).includes(value);
}

/** Rolle eines Feldes: explizit (`x-ui-role`) vor abgeleitet (`x-ui-widget`). */
export function resolveFieldRole(field: FieldSchema | undefined): FieldRole | undefined {
  if (!field) return undefined;
  const explicit = field['x-ui-role'];
  if (isFieldRole(explicit)) return explicit;
  const widget = field['x-ui-widget'];
  return typeof widget === 'string' ? WIDGET_ROLE[widget] : undefined;
}

interface CatalogStep {
  name?: string;
  paramSchema?: ParamSchema;
  abiFragment?: AbiFragment;
}

export interface AnnotationGap {
  step: string;
  field: string;
}

/**
 * Mindest-Annotations-Pass: findet Geld-Ziel-Felder (address-typisierte
 * `recipient`/`to`/`receiver`/`destination`-Komponenten im abiFragment), die
 * **nicht** als `recipient` markiert sind. Ohne diese Markierung wären sie für
 * `SummaryDecoder` und Allowlist-Guard unsichtbar → die Lücke muss auffallen.
 */
export function findUnannotatedRecipients(steps: CatalogStep[]): AnnotationGap[] {
  const gaps: AnnotationGap[] = [];
  for (const step of steps) {
    const components = step.abiFragment?.components ?? [];
    const properties = step.paramSchema?.properties ?? {};
    for (const { name, type } of components) {
      if (type !== 'address') continue;
      if (!RECIPIENT_FIELD_NAMES.has(name.toLowerCase())) continue;
      if (resolveFieldRole(properties[name]) !== 'recipient') {
        gaps.push({ step: step.name ?? '(unbenannt)', field: name });
      }
    }
  }
  return gaps;
}
