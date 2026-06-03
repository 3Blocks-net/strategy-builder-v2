/**
 * Encode-boundary mapper — runs frontend-side just before `POST /encode`.
 *
 * Converts each node's **friendly** params (as stored in `node.data.params`)
 * into the **raw** values the backend ABI-encoder expects, and strips every
 * friendly-only field. The output for a node carries ONLY keys present in that
 * step type's `abiFragment`, with raw string values (uint256 as string, since
 * precision can exceed 2^53).
 *
 * Slice 2 handles the `duration` widget (`{ value, unit }` → seconds string).
 * Later slices extend `mapFieldToRaw` (token-amount, toggles, start-time →
 * contextOverrides). The generic backend encoder stays unchanged.
 */

import { toSeconds, encodeTimestamp, type Duration } from 'shared';

export interface AbiFragment {
  type: string;
  components: { name: string; type: string }[];
}

export interface FieldSchema {
  type?: string;
  'x-ui-widget'?: string;
  [key: string]: unknown;
}

export interface ParamSchema {
  properties?: Record<string, FieldSchema>;
  required?: string[];
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
function mapFieldToRaw(widget: string | undefined, value: unknown): unknown {
  if (widget === 'duration') {
    if (isDuration(value)) return String(toSeconds(value));
    // Already raw (string seconds) or unset — pass through untouched.
    return value;
  }
  return value;
}

/**
 * Map a single node's friendly params to raw params, keeping only the keys that
 * appear in the step type's `abiFragment`. Returns `{}` if the abiFragment is
 * unknown (the backend will fall back to its own defaults / guard).
 */
export function mapParamsToRaw(
  params: Record<string, unknown>,
  schema: StepSchema | undefined,
): Record<string, unknown> {
  const components = schema?.abiFragment?.components ?? [];
  const properties = schema?.paramSchema?.properties ?? {};
  const raw: Record<string, unknown> = {};

  for (const { name } of components) {
    const widget = properties[name]?.['x-ui-widget'];
    const value = params[name];
    if (value === undefined) continue; // let the backend apply schema defaults
    raw[name] = mapFieldToRaw(widget, value);
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
): RawGraph {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: (n.type as 'CONDITION' | 'ACTION') ?? 'ACTION',
      data: {
        stepTypeId: n.data.stepTypeId,
        params: mapParamsToRaw(n.data.params ?? {}, stepSchemas[n.data.stepTypeId]),
      },
    })),
    edges: edges.map((e) => ({
      source: e.source,
      target: e.target,
      sourceHandle: (e.sourceHandle as 'true' | 'false' | 'out') ?? 'out',
    })),
  };
}
