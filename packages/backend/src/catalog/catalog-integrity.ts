import { findUnannotatedRecipients } from 'shared';
import {
  ACTION_CAPABILITIES,
  AmountMode,
  type ActionCapability,
} from './action-capabilities';

/**
 * Schema↔contract integrity guard. Cross-checks the StepType catalog's
 * LLM-/UI-facing `paramSchema` against the on-chain action capabilities so stale
 * or contradictory metadata fails CI rather than users (the TARGET_HF
 * "not yet available" drift class). Pure function — fed by a test over the
 * composed catalog. Reuses `shared/step-roles` for the role check (no reimpl).
 */

/** The minimal catalog shape the guard reads (a superset-compatible StepTypeDef). */
export interface CatalogEntry {
  name: string;
  contractKey: string;
  paramSchema: unknown;
  abiFragment: unknown;
}

export type IntegrityRule =
  | 'mode-unsupported'
  | 'mode-field-missing'
  | 'stale-phrase'
  | 'abi-schema-drift'
  | 'unannotated-role';

export interface Violation {
  step: string;
  field: string;
  rule: IntegrityRule;
  detail: string;
}

/** Availability disclaimers that must not appear on an *offered* field. */
const STALE_PHRASES = [/not yet available/i, /later slice/i, /\breserved\b/i];

/**
 * Widgets the shared encode-boundary (`mapParamsToRaw`) strips as friendly-only,
 * so a schema property carrying one legitimately has no `abiFragment` component.
 * Mirrors `encode-boundary.ts` (the `'start-time'` discriminant).
 */
const FRIENDLY_WIDGETS = new Set(['start-time']);

const AMOUNT_MODE_WIDGET = 'aave-amount-mode';

interface FieldSchema {
  description?: string;
  'x-ui-widget'?: string;
  'x-ui-hidden'?: boolean;
  'x-ui-modes'?: number[];
}

function propertiesOf(paramSchema: unknown): Record<string, FieldSchema> {
  if (paramSchema && typeof paramSchema === 'object' && 'properties' in paramSchema) {
    return (paramSchema as { properties?: Record<string, FieldSchema> }).properties ?? {};
  }
  return {};
}

function abiComponentNames(abiFragment: unknown): string[] {
  if (abiFragment && typeof abiFragment === 'object' && 'components' in abiFragment) {
    const comps = (abiFragment as { components?: { name: string }[] }).components ?? [];
    return comps.map((c) => c.name);
  }
  return [];
}

/** Returns every catalog-integrity violation; an empty array means the catalog is clean. */
export function checkCatalogIntegrity(
  catalog: readonly CatalogEntry[],
  capabilities: Record<string, ActionCapability> = ACTION_CAPABILITIES,
): Violation[] {
  const violations: Violation[] = [];

  for (const entry of catalog) {
    const props = propertiesOf(entry.paramSchema);
    const cap = capabilities[entry.contractKey];

    const modeFieldName = Object.keys(props).find(
      (k) => props[k]['x-ui-widget'] === AMOUNT_MODE_WIDGET,
    );
    const advertised: number[] = modeFieldName
      ? (props[modeFieldName]['x-ui-modes'] ?? [])
      : [];

    // Widgets that are "offered" via an advertised mode (e.g. a hidden health-factor
    // field becomes offered when TARGET_HF is advertised) — used by the stale-phrase rule.
    const offeredModeWidgets = new Set<string>();

    if (cap) {
      // Rule 2.2 — advertised modes ⊆ supported.
      for (const m of advertised) {
        if (!cap.supportedModes.includes(m as AmountMode)) {
          violations.push({
            step: entry.name,
            field: modeFieldName ?? 'mode',
            rule: 'mode-unsupported',
            detail: `advertised mode ${m} not in supported [${cap.supportedModes.join(', ')}]`,
          });
        }
      }
      // Rule 2.3 — mode-dependent field present when the mode is offered.
      for (const req of cap.modeFields ?? []) {
        if (!advertised.includes(req.mode)) continue;
        offeredModeWidgets.add(req.widget);
        const present = Object.values(props).some((f) => f['x-ui-widget'] === req.widget);
        if (!present) {
          violations.push({
            step: entry.name,
            field: `(widget:${req.widget})`,
            rule: 'mode-field-missing',
            detail: `mode ${AmountMode[req.mode]} advertised but no '${req.widget}' field present`,
          });
        }
      }
    }

    // Rule 2.4 — no stale availability phrases on an offered field.
    for (const [fname, f] of Object.entries(props)) {
      const widget = f['x-ui-widget'];
      const offered = !f['x-ui-hidden'] || (widget !== undefined && offeredModeWidgets.has(widget));
      if (!offered) continue;
      const desc = f.description ?? '';
      if (STALE_PHRASES.some((re) => re.test(desc))) {
        violations.push({
          step: entry.name,
          field: fname,
          rule: 'stale-phrase',
          detail: `offered field describes itself as unavailable: "${desc.slice(0, 70)}"`,
        });
      }
    }

    // Rule 2.5 — ABI ↔ schema lockstep.
    const abiNames = abiComponentNames(entry.abiFragment);
    const propNames = new Set(Object.keys(props));
    for (const a of abiNames) {
      if (!propNames.has(a)) {
        violations.push({
          step: entry.name,
          field: a,
          rule: 'abi-schema-drift',
          detail: `abiFragment component '${a}' has no paramSchema property`,
        });
      }
    }
    for (const [pname, f] of Object.entries(props)) {
      if (abiNames.includes(pname)) continue;
      if (f['x-ui-hidden']) continue;
      const widget = f['x-ui-widget'];
      if (widget && FRIENDLY_WIDGETS.has(widget)) continue;
      violations.push({
        step: entry.name,
        field: pname,
        rule: 'abi-schema-drift',
        detail: `non-hidden property '${pname}' has no abiFragment component (not a friendly widget)`,
      });
    }
  }

  // Rule 2.6 — money-target fields must resolve to a role (reuse shared/step-roles).
  const gaps = findUnannotatedRecipients(
    catalog.map((e) => ({
      name: e.name,
      paramSchema: e.paramSchema,
      abiFragment: e.abiFragment,
    })) as Parameters<typeof findUnannotatedRecipients>[0],
  );
  for (const gap of gaps) {
    violations.push({
      step: gap.step,
      field: gap.field,
      rule: 'unannotated-role',
      detail: `money-target field '${gap.field}' resolves to no recipient role`,
    });
  }

  return violations;
}
