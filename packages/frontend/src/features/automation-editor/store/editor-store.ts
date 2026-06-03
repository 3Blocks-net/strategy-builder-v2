import { create } from 'zustand';
import {
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type Connection,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
} from '@xyflow/react';
import { validateParams, type ParamSchema } from 'shared';
import { validateGraph } from '../lib/validate-graph';
import { autoLayout } from '../lib/auto-layout';
import type { StepSchema, AbiFragment } from '../lib/encode-boundary';
import type { ValidationError, GraphNode, GraphEdge } from '../lib/types';

export interface StepTypeOption {
  id: string;
  name: string;
  description: string;
  category: 'CONDITION' | 'ACTION';
  contractAddress: string;
  selector: string;
  afterExecutionSelector: string | null;
  paramSchema?: ParamSchema;
  abiFragment?: AbiFragment;
}

/**
 * Node-init default materialization: build a self-complete param set for a new
 * node from its `paramSchema`. Static `default`s are copied verbatim; the
 * read-write context-slot ("time slot") fields get a deterministic per-node
 * name so the trigger's slot is auto-allocated without the user ever seeing a
 * slot number (US #9). Keeps `params` self-complete so required-validation,
 * round-trip, and display stay consistent on creation.
 */
export function materializeDefaultParams(
  paramSchema: ParamSchema | undefined,
  nodeId: string,
  vaultAddress?: string,
): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  const properties = paramSchema?.properties ?? {};
  for (const [name, fieldSchema] of Object.entries(properties)) {
    if (fieldSchema.default !== undefined) {
      params[name] = fieldSchema.default;
    }
    if (
      fieldSchema['x-ui-widget'] === 'context-slot' &&
      fieldSchema['x-ui-slot-access'] === 'read-write'
    ) {
      params[name] = `__time_${nodeId}`;
    }
    // start-time defaults to "now" (Unix seconds) — dynamic, so not expressible
    // as a static schema default.
    if (fieldSchema['x-ui-widget'] === 'start-time' && fieldSchema.default === undefined) {
      params[name] = Math.floor(Date.now() / 1000);
    }
    // account-selector fields default to the vault address (US #11) — effective
    // without the user opening the form, killing the latent zero-address bug.
    if (fieldSchema['x-ui-widget'] === 'account-selector' && vaultAddress) {
      params[name] = vaultAddress;
    }
  }
  return params;
}

function validateNodeParams(
  nodes: Node<EditorNodeData>[],
  stepSchemas: Record<string, StepSchema>,
  tokenDecimals: Record<string, number>,
): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const node of nodes) {
    const schema = stepSchemas[node.data.stepTypeId]?.paramSchema as
      | ParamSchema
      | undefined;
    if (!schema) continue;
    const paramErrors = validateParams(schema, node.data.params ?? {}, {
      mode: 'friendly',
      tokenDecimals,
    });
    for (const e of paramErrors) {
      errors.push({ message: e.message, nodeId: node.id, fieldName: e.field });
    }
  }
  return errors;
}

export interface EditorNodeData {
  stepTypeId: string;
  stepTypeName: string;
  category: 'CONDITION' | 'ACTION';
  contractAddress: string;
  selector: string;
  params: Record<string, unknown>;
  [key: string]: unknown;
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface Snapshot {
  nodes: Node<EditorNodeData>[];
  edges: Edge[];
}

const MAX_HISTORY = 50;

export interface ContextVariable {
  slotIndex: number;
  name: string;
  type: string;
  description: string;
  createdByAutomationId?: string;
}

/**
 * Merge two sets of context variables by slotIndex. `overlay` entries win on
 * conflict; slots present in only one source are kept. Result is sorted by
 * slotIndex.
 *
 * Used to combine the vault-wide context slots (from /context-slots, populated
 * at deploy time) with the automation's draft variables (from
 * editorState.contextVariables, auto-saved while editing). Both load paths run
 * concurrently on mount, so the merge must be commutative — see the two store
 * actions below, which pick precedence such that the outcome is independent of
 * which fetch resolves first.
 */
export function mergeContextVariables(
  base: ContextVariable[],
  overlay: ContextVariable[],
): ContextVariable[] {
  const bySlot = new Map<number, ContextVariable>();
  for (const v of base) bySlot.set(v.slotIndex, v);
  for (const v of overlay) bySlot.set(v.slotIndex, v);
  return [...bySlot.values()].sort((a, b) => a.slotIndex - b.slotIndex);
}

export interface EditorState {
  nodes: Node<EditorNodeData>[];
  edges: Edge[];
  selectedNodeId: string | null;
  label: string;
  description: string;
  validationErrors: ValidationError[];
  ownerOnly: boolean;
  isDirty: boolean;
  saveStatus: SaveStatus;
  past: Snapshot[];
  future: Snapshot[];
  clipboard: Snapshot | null;
  contextVariables: ContextVariable[];
  activeTab: 'config' | 'context';
  stepSchemas: Record<string, StepSchema>;
  tokenDecimals: Record<string, number>;
  vaultAddress: string;

  onNodesChange: OnNodesChange<Node<EditorNodeData>>;
  onEdgesChange: OnEdgesChange;
  onConnect: (connection: Connection) => void;
  setSelectedNodeId: (nodeId: string | null) => void;
  addNode: (stepType: StepTypeOption, position: { x: number; y: number }) => void;
  removeSelected: () => void;
  updateNodeParams: (nodeId: string, params: Record<string, unknown>) => void;
  runValidation: () => void;
  setLabel: (label: string) => void;
  setDescription: (description: string) => void;
  markDirty: () => void;
  setSaveStatus: (status: SaveStatus) => void;
  loadEditorState: (state: { nodes: Node<EditorNodeData>[]; edges: Edge[]; label?: string; description?: string }) => void;
  pushSnapshot: () => void;
  undo: () => void;
  redo: () => void;
  copySelected: () => void;
  paste: () => void;
  applyAutoLayout: () => void;
  setActiveTab: (tab: 'config' | 'context') => void;
  addContextVariable: (variable: Omit<ContextVariable, 'slotIndex'>) => void;
  updateContextVariable: (slotIndex: number, updates: Partial<ContextVariable>) => void;
  setContextVariables: (variables: ContextVariable[]) => void;
  setStepSchemas: (schemas: Record<string, StepSchema>) => void;
  setTokenDecimals: (decimals: Record<string, number>) => void;
  setVaultAddress: (address: string) => void;
  mergeEditorContextVariables: (variables: ContextVariable[]) => void;
  mergeVaultContextSlots: (slots: ContextVariable[]) => void;
}

let nodeCounter = 0;
let validationTimer: ReturnType<typeof setTimeout> | null = null;

function toGraphNodes(nodes: Node<EditorNodeData>[]): GraphNode[] {
  return nodes.map((n) => ({
    id: n.id,
    type: (n.type as 'CONDITION' | 'ACTION') ?? 'ACTION',
    position: n.position,
    data: {
      stepTypeId: n.data.stepTypeId,
      label: n.data.stepTypeName,
      contractAddress: n.data.contractAddress,
      selector: n.data.selector,
      params: n.data.params,
    },
  }));
}

function toGraphEdges(edges: Edge[]): GraphEdge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: (e.sourceHandle as 'true' | 'false' | 'out') ?? 'out',
  }));
}

function inferOwnerOnly(nodes: Node<EditorNodeData>[], edges: Edge[]): boolean {
  if (nodes.length === 0) return false;
  const incomingCount = new Map<string, number>();
  for (const n of nodes) incomingCount.set(n.id, 0);
  for (const e of edges)
    incomingCount.set(e.target, (incomingCount.get(e.target) ?? 0) + 1);
  const startNodes = nodes.filter((n) => incomingCount.get(n.id) === 0);
  return startNodes.length === 1 && startNodes[0].type === 'ACTION';
}

export const useEditorStore = create<EditorState>((set, get) => {
  function scheduleValidation() {
    if (validationTimer) clearTimeout(validationTimer);
    validationTimer = setTimeout(() => get().runValidation(), 300);
  }

  function pushSnapshot() {
    const { nodes, edges, past } = get();
    const snap: Snapshot = { nodes: structuredClone(nodes), edges: structuredClone(edges) };
    const newPast = [...past, snap];
    if (newPast.length > MAX_HISTORY) newPast.shift();
    set({ past: newPast, future: [] });
  }

  return {
  nodes: [],
  edges: [],
  selectedNodeId: null,
  label: '',
  description: '',
  validationErrors: [],
  ownerOnly: false,
  isDirty: false,
  saveStatus: 'idle' as SaveStatus,
  past: [] as Snapshot[],
  future: [] as Snapshot[],
  clipboard: null as Snapshot | null,
  contextVariables: [] as ContextVariable[],
  activeTab: 'config' as 'config' | 'context',
  stepSchemas: {} as Record<string, StepSchema>,
  tokenDecimals: {} as Record<string, number>,
  vaultAddress: '',

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) });
    const selectionChange = changes.find(
      (c) => c.type === 'select' && c.selected,
    );
    if (selectionChange && 'id' in selectionChange) {
      set({ selectedNodeId: selectionChange.id, activeTab: 'config' });
    }
    const structural = changes.some((c) => c.type === 'add' || c.type === 'remove');
    if (structural) { set({ isDirty: true }); scheduleValidation(); }
    if (changes.some((c) => c.type === 'position' && !c.dragging)) {
      set({ isDirty: true });
      pushSnapshot();
    }
  },

  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });
    const structural = changes.some((c) => c.type === 'add' || c.type === 'remove');
    if (structural) { set({ isDirty: true }); scheduleValidation(); }
  },

  onConnect: (connection) => {
    pushSnapshot();
    const sourceNode = get().nodes.find((n) => n.id === connection.source);
    let label = 'Next';
    let style = { stroke: '#9ca3af' };

    if (sourceNode?.type === 'CONDITION') {
      if (connection.sourceHandle === 'true') {
        label = 'True';
        style = { stroke: '#22c55e' };
      } else if (connection.sourceHandle === 'false') {
        label = 'False';
        style = { stroke: '#ef4444' };
      }
    }

    const edge: Edge = {
      ...connection,
      id: `e-${connection.source}-${connection.sourceHandle}-${connection.target}`,
      label,
      style,
      type: 'default',
    };

    set({ edges: addEdge(edge, get().edges), isDirty: true });
    scheduleValidation();
  },

  setSelectedNodeId: (nodeId) => set({ selectedNodeId: nodeId }),

  addNode: (stepType, position) => {
    pushSnapshot();
    const id = `node-${++nodeCounter}`;
    const newNode: Node<EditorNodeData> = {
      id,
      type: stepType.category,
      position,
      data: {
        stepTypeId: stepType.id,
        stepTypeName: stepType.name,
        category: stepType.category,
        contractAddress: stepType.contractAddress,
        selector: stepType.selector,
        // Node-init: materialize the full default param set so the node is
        // self-complete from creation (no latent unset-field bugs, incl. the
        // account = vault default).
        params: materializeDefaultParams(stepType.paramSchema, id, get().vaultAddress),
      },
    };
    set({ nodes: [...get().nodes, newNode], isDirty: true });
    scheduleValidation();
  },

  removeSelected: () => {
    const { nodes, edges } = get();
    const selectedNodeIds = new Set(nodes.filter((n) => n.selected).map((n) => n.id));
    const selectedEdgeIds = new Set(edges.filter((e) => e.selected).map((e) => e.id));

    if (selectedNodeIds.size === 0 && selectedEdgeIds.size === 0) return;
    pushSnapshot();
    set({
      nodes: nodes.filter((n) => !selectedNodeIds.has(n.id)),
      edges: edges.filter(
        (e) =>
          !selectedEdgeIds.has(e.id) &&
          !selectedNodeIds.has(e.source) &&
          !selectedNodeIds.has(e.target),
      ),
      selectedNodeId: null,
      isDirty: true,
    });
    scheduleValidation();
  },

  updateNodeParams: (nodeId, params) => {
    pushSnapshot();
    set({
      nodes: get().nodes.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, params: { ...n.data.params, ...params } } }
          : n,
      ),
      isDirty: true,
    });
    // Re-run validation so inline per-field errors and the Deploy gate update
    // as the user edits params.
    scheduleValidation();
  },

  runValidation: () => {
    const { nodes, edges, stepSchemas, tokenDecimals } = get();
    const oo = inferOwnerOnly(nodes, edges);
    const graphNodes = toGraphNodes(nodes);
    const graphEdges = toGraphEdges(edges);
    const graphErrors = validateGraph(graphNodes, graphEdges, !oo);
    // Second pass: schema-driven param validation over ALL nodes (even ones
    // never opened) merged into the same list, so the Deploy gate engages
    // purely via validationErrors.length and the panel + inline errors share
    // one source of truth.
    const paramErrors = validateNodeParams(nodes, stepSchemas, tokenDecimals);
    set({ validationErrors: [...graphErrors, ...paramErrors], ownerOnly: oo });
  },

  setLabel: (label) => set({ label, isDirty: true }),
  setDescription: (description) => set({ description, isDirty: true }),

  markDirty: () => set({ isDirty: true }),
  setSaveStatus: (status) => set({ saveStatus: status, ...(status === 'saved' ? { isDirty: false } : {}) }),

  loadEditorState: (state) => {
    set({
      nodes: state.nodes,
      edges: state.edges,
      label: state.label ?? '',
      description: state.description ?? '',
      isDirty: false,
      saveStatus: 'idle',
      past: [],
      future: [],
    });
    setTimeout(() => get().runValidation(), 0);
  },

  pushSnapshot: () => pushSnapshot(),

  undo: () => {
    const { past, nodes, edges, future } = get();
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    set({
      past: past.slice(0, -1),
      future: [...future, { nodes: structuredClone(nodes), edges: structuredClone(edges) }],
      nodes: prev.nodes,
      edges: prev.edges,
      isDirty: true,
    });
    scheduleValidation();
  },

  redo: () => {
    const { past, nodes, edges, future } = get();
    if (future.length === 0) return;
    const next = future[future.length - 1];
    set({
      future: future.slice(0, -1),
      past: [...past, { nodes: structuredClone(nodes), edges: structuredClone(edges) }],
      nodes: next.nodes,
      edges: next.edges,
      isDirty: true,
    });
    scheduleValidation();
  },

  copySelected: () => {
    const { nodes, edges } = get();
    const selected = nodes.filter((n) => n.selected);
    if (selected.length === 0) return;
    const selectedIds = new Set(selected.map((n) => n.id));
    const selectedEdges = edges.filter(
      (e) => selectedIds.has(e.source) && selectedIds.has(e.target),
    );
    set({ clipboard: { nodes: structuredClone(selected), edges: structuredClone(selectedEdges) } });
  },

  paste: () => {
    const { clipboard } = get();
    if (!clipboard || clipboard.nodes.length === 0) return;
    pushSnapshot();

    const suffix = `-copy-${Date.now()}`;
    const idMap = new Map<string, string>();
    clipboard.nodes.forEach((n) => idMap.set(n.id, `${n.id}${suffix}`));

    const newNodes: Node<EditorNodeData>[] = clipboard.nodes.map((n) => ({
      ...n,
      id: idMap.get(n.id)!,
      position: { x: n.position.x + 50, y: n.position.y + 50 },
      selected: true,
    }));

    const newEdges: Edge[] = clipboard.edges.map((e) => ({
      ...e,
      id: `${e.id}${suffix}`,
      source: idMap.get(e.source) ?? e.source,
      target: idMap.get(e.target) ?? e.target,
    }));

    const existingNodes = get().nodes.map((n) => ({ ...n, selected: false }));
    const existingEdges = get().edges;

    set({
      nodes: [...existingNodes, ...newNodes],
      edges: [...existingEdges, ...newEdges],
      isDirty: true,
    });
    scheduleValidation();
  },

  applyAutoLayout: () => {
    pushSnapshot();
    const { nodes, edges } = get();
    const graphNodes: GraphNode[] = toGraphNodes(nodes);
    const graphEdges: GraphEdge[] = toGraphEdges(edges);
    const { nodes: laid } = autoLayout(graphNodes, graphEdges, 'TB');

    const posMap = new Map(laid.map((n) => [n.id, n.position]));
    set({
      nodes: nodes.map((n) => ({
        ...n,
        position: posMap.get(n.id) ?? n.position,
      })),
      isDirty: true,
    });
  },

  setActiveTab: (tab) => set({ activeTab: tab }),

  setContextVariables: (variables) => set({ contextVariables: variables }),

  setStepSchemas: (schemas) => {
    set({ stepSchemas: schemas });
    // Schemas may arrive after the graph loads; re-validate so param errors
    // for never-opened nodes show up once their schema is known.
    scheduleValidation();
  },

  setTokenDecimals: (decimals) => {
    set({ tokenDecimals: decimals });
    // Token decimals gate the token-amount over-precision check.
    scheduleValidation();
  },

  setVaultAddress: (address) => set({ vaultAddress: address }),

  // Auto-saved draft variables are the source of truth for editing, so they
  // win on slotIndex conflicts (overlay = incoming).
  mergeEditorContextVariables: (variables) =>
    set({ contextVariables: mergeContextVariables(get().contextVariables, variables) }),

  // Vault-wide slots only fill gaps — never clobber draft edits already in the
  // store (overlay = current). This keeps both load paths commutative, so a
  // slow /context-slots response can no longer wipe freshly-loaded draft vars.
  mergeVaultContextSlots: (slots) =>
    set({ contextVariables: mergeContextVariables(slots, get().contextVariables) }),

  addContextVariable: (variable) => {
    const { contextVariables } = get();
    const nextIndex = contextVariables.length > 0
      ? Math.max(...contextVariables.map((v) => v.slotIndex)) + 1
      : 0;
    set({
      contextVariables: [...contextVariables, { ...variable, slotIndex: nextIndex }],
      isDirty: true,
    });
  },

  updateContextVariable: (slotIndex, updates) => {
    set({
      contextVariables: get().contextVariables.map((v) =>
        v.slotIndex === slotIndex ? { ...v, ...updates } : v,
      ),
      isDirty: true,
    });
  },
};
});
