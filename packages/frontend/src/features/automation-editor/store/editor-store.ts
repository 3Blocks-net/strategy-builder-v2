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

  onNodesChange: OnNodesChange<Node<EditorNodeData>>;
  onEdgesChange: OnEdgesChange;
  onConnect: (connection: Connection) => void;
  setSelectedNodeId: (nodeId: string | null) => void;
  addNode: (stepType: StepTypeOption, position: { x: number; y: number }) => void;
  removeSelected: () => void;
  updateNodeParams: (nodeId: string, params: Record<string, unknown>) => void;
  setLabel: (label: string) => void;
  setDescription: (description: string) => void;
}

let nodeCounter = 0;

export const useEditorStore = create<EditorState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  label: '',
  description: '',

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) });
    const selectionChange = changes.find(
      (c) => c.type === 'select' && c.selected,
    );
    if (selectionChange && 'id' in selectionChange) {
      set({ selectedNodeId: selectionChange.id });
    }
  },

  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });
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

  setLabel: (label) => set({ label }),
  setDescription: (description) => set({ description }),
}));
