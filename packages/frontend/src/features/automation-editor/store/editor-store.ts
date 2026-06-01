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

export interface EditorState {
  nodes: Node<EditorNodeData>[];
  edges: Edge[];
  selectedNodeId: string | null;
  label: string;
  description: string;
  validationErrors: ValidationError[];
  ownerOnly: boolean;

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

  return {
  nodes: [],
  edges: [],
  selectedNodeId: null,
  label: '',
  description: '',
  validationErrors: [],
  ownerOnly: false,

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) });
    const selectionChange = changes.find(
      (c) => c.type === 'select' && c.selected,
    );
    if (selectionChange && 'id' in selectionChange) {
      set({ selectedNodeId: selectionChange.id });
    }
    const structural = changes.some((c) => c.type === 'add' || c.type === 'remove');
    if (structural) scheduleValidation();
  },

  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });
    const structural = changes.some((c) => c.type === 'add' || c.type === 'remove');
    if (structural) scheduleValidation();
  },

  onConnect: (connection) => {
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

    set({ edges: addEdge(edge, get().edges) });
    scheduleValidation();
  },

  setSelectedNodeId: (nodeId) => set({ selectedNodeId: nodeId }),

  addNode: (stepType, position) => {
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
    set({ nodes: [...get().nodes, newNode] });
    scheduleValidation();
  },

  removeSelected: () => {
    const { selectedNodeId, nodes, edges } = get();
    if (!selectedNodeId) return;
    set({
      nodes: nodes.filter((n) => n.id !== selectedNodeId),
      edges: edges.filter(
        (e) => e.source !== selectedNodeId && e.target !== selectedNodeId,
      ),
      selectedNodeId: null,
    });
    scheduleValidation();
  },

  updateNodeParams: (nodeId, params) => {
    set({
      nodes: get().nodes.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, params: { ...n.data.params, ...params } } }
          : n,
      ),
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

  setLabel: (label) => set({ label }),
  setDescription: (description) => set({ description }),
};
});
