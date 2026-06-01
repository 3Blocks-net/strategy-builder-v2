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
import { validateGraph } from '../lib/validate-graph';
import { autoLayout } from '../lib/auto-layout';
import type { ValidationError, GraphNode, GraphEdge } from '../lib/types';

export interface StepTypeOption {
  id: string;
  name: string;
  description: string;
  category: 'CONDITION' | 'ACTION';
  contractAddress: string;
  selector: string;
  afterExecutionSelector: string | null;
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

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) });
    const selectionChange = changes.find(
      (c) => c.type === 'select' && c.selected,
    );
    if (selectionChange && 'id' in selectionChange) {
      set({ selectedNodeId: selectionChange.id });
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
        params: {},
      },
    };
    set({ nodes: [...get().nodes, newNode], isDirty: true });
    scheduleValidation();
  },

  removeSelected: () => {
    const { selectedNodeId, nodes, edges } = get();
    if (!selectedNodeId) return;
    pushSnapshot();
    set({
      nodes: nodes.filter((n) => n.id !== selectedNodeId),
      edges: edges.filter(
        (e) => e.source !== selectedNodeId && e.target !== selectedNodeId,
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
  },

  runValidation: () => {
    const { nodes, edges } = get();
    const oo = inferOwnerOnly(nodes, edges);
    const graphNodes = toGraphNodes(nodes);
    const graphEdges = toGraphEdges(edges);
    const errors = validateGraph(graphNodes, graphEdges, !oo);
    set({ validationErrors: errors, ownerOnly: oo });
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
};
});
