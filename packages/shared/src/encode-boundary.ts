/**
 * Encode-boundary mapper — die eine, geteilte Quelle für den friendly→raw-Schritt
 * direkt vor `POST /encode`.
 *
 * Konvertiert die **friendly** Params jedes Nodes (wie in `node.data.params`
 * gehalten) in die **raw** Werte, die der Backend-ABI-Encoder erwartet, und
 * entfernt jedes friendly-only-Feld. Die Ausgabe eines Nodes trägt NUR Keys, die
 * im `abiFragment` des Step-Types vorkommen, mit raw-String-Werten (uint256 als
 * String, da die Präzision 2^53 übersteigen kann).
 *
 * Wird sowohl vom Frontend (Automation-Editor) als auch vom MCP-Server konsumiert
 * — keine Duplikation. Hängt ausschließlich von `shared`-Helfern ab.
 */

import { toSeconds, type Duration } from './duration';
import { encodeTimestamp } from './timestamp';
import { toBaseUnits } from './amount';
import { zeroToggleField, type FieldSchema, type ParamSchema } from './validation';

export interface AbiFragment {
  type: string;
  components: { name: string; type: string }[];
}

export interface StepSchema {
  paramSchema?: ParamSchema;
  abiFragment?: AbiFragment;
}

/** Shape the backend `EditorGraph` expects. */
export interface RawGraphNode {
  id: string;
  type: 'CONDITION' | 'ACTION';
  data: { stepTypeId: string; params: Record<string, unknown> };
}

export interface RawGraphEdge {
  source: string;
  target: string;
  sourceHandle: 'true' | 'false' | 'out';
}

export interface RawGraph {
  nodes: RawGraphNode[];
  edges: RawGraphEdge[];
}

function isDuration(value: unknown): value is Duration {
  return (
    typeof value === 'object' &&
    value !== null &&
    'value' in value &&
    'unit' in value
  );
}

/** Convert one friendly field value to its raw representation. */
function mapFieldToRaw(
  field: string,
  widget: string | undefined,
  value: unknown,
  fieldSchema: FieldSchema | undefined,
  params: Record<string, unknown>,
  tokenDecimals?: Record<string, number>,
): unknown {
  if (widget === 'duration') {
    if (isDuration(value)) return String(toSeconds(value));
    // Already raw (string seconds) or unset — pass through untouched.
    return value;
  }

  if (widget === 'health-factor') {
    // Friendly human HF (e.g. "1.5") → wad (1.5e18). Unused/"0" → "0".
    const s = value === undefined || value === null || value === '' ? '0' : String(value);
    return toBaseUnits(s, 18);
  }

  if (widget === 'token-amount') {
    // Zero-toggle on ⇒ the contract's "0 means special" path (full balance /
    // fill-to-target). The friendly boolean is friendly-only and gets stripped.
    if (
      fieldSchema?.['x-ui-zero-toggle'] != null &&
      params[zeroToggleField(field)] === true
    ) {
      return '0';
    }

    const tokenField = fieldSchema?.['x-ui-amount-token-field'] as string | undefined;
    const tokenAddr = tokenField ? params[tokenField] : undefined;
    const decimals =
      typeof tokenAddr === 'string'
        ? tokenDecimals?.[tokenAddr.toLowerCase()]
        : undefined;
    if (decimals === undefined) {
      throw new Error(
        `Cannot convert amount: unknown decimals for token ${String(tokenAddr)}. Select an accepted token.`,
      );
    }
    return toBaseUnits(String(value), decimals);
  }

  return value;
}

/**
 * Map a single node's friendly params to raw params, keeping only the keys that
 * appear in the step type's `abiFragment`. Returns `{}` if the abiFragment is
 * unknown (the backend will fall back to its own defaults / guard).
 *
 * `tokenDecimals` (lowercased address → decimals, from the loaded accepted-token
 * list) is used to convert `token-amount` fields — no extra network call.
 */
export function mapParamsToRaw(
  params: Record<string, unknown>,
  schema: StepSchema | undefined,
  tokenDecimals?: Record<string, number>,
): Record<string, unknown> {
  const components = schema?.abiFragment?.components ?? [];
  const properties = schema?.paramSchema?.properties ?? {};
  const raw: Record<string, unknown> = {};

  for (const { name } of components) {
    const fieldSchema = properties[name];
    const widget = fieldSchema?.['x-ui-widget'];
    const value = params[name];
    const zeroToggleOn =
      widget === 'token-amount' &&
      fieldSchema?.['x-ui-zero-toggle'] != null &&
      params[zeroToggleField(name)] === true;
    // Skip unset fields so the backend applies its schema default — unless a
    // zero-toggle is on, where the amount is meant to be 0 regardless.
    if (value === undefined && !zeroToggleOn) continue;
    raw[name] = mapFieldToRaw(name, widget, value, fieldSchema, params, tokenDecimals);
  }

  return raw;
}

/**
 * Build the name-keyed `contextOverrides` for `POST /encode` from every node's
 * friendly `start-time` field. A `start-time` field declares which context-slot
 * field it seeds via `x-ui-time-slot-field`; we read that field's variable name
 * (e.g. `__time_<nodeId>`) and map it to the ABI-encoded chosen timestamp. The
 * friendly `startTime` field is stripped by {@link mapParamsToRaw} (it never
 * appears in the abiFragment), so only the override carries it forward.
 */
export function buildContextOverrides(
  nodes: EditorNodeLike[],
  stepSchemas: Record<string, StepSchema>,
): Record<string, string> {
  const overrides: Record<string, string> = {};

  for (const node of nodes) {
    const properties = stepSchemas[node.data.stepTypeId]?.paramSchema?.properties ?? {};
    for (const [field, fieldSchema] of Object.entries(properties)) {
      if (fieldSchema['x-ui-widget'] !== 'start-time') continue;

      const slotField = fieldSchema['x-ui-time-slot-field'] as string | undefined;
      if (!slotField) continue;

      const slotName = node.data.params[slotField];
      const startTime = node.data.params[field];
      if (typeof slotName !== 'string' || slotName === '') continue;
      if (startTime === undefined || startTime === null || startTime === '') continue;

      overrides[slotName] = encodeTimestamp(Number(startTime));
    }
  }

  return overrides;
}

interface EditorNodeLike {
  id: string;
  type?: string;
  data: { stepTypeId: string; params: Record<string, unknown> };
}

interface EditorEdgeLike {
  source: string;
  target: string;
  sourceHandle?: string | null;
}

/**
 * Build the raw graph sent to `POST /encode`: maps every node's friendly params
 * to raw (stripping friendly-only fields) and normalises edges.
 */
export function mapGraphToRaw(
  nodes: EditorNodeLike[],
  edges: EditorEdgeLike[],
  stepSchemas: Record<string, StepSchema>,
  tokenDecimals?: Record<string, number>,
): RawGraph {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: (n.type as 'CONDITION' | 'ACTION') ?? 'ACTION',
      data: {
        stepTypeId: n.data.stepTypeId,
        params: mapParamsToRaw(n.data.params ?? {}, stepSchemas[n.data.stepTypeId], tokenDecimals),
      },
    })),
    edges: edges.map((e) => ({
      source: e.source,
      target: e.target,
      sourceHandle: (e.sourceHandle as 'true' | 'false' | 'out') ?? 'out',
    })),
  };
}
