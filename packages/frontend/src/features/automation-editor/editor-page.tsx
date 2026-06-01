import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  type NodeTypes,
  type Edge,
  type Connection,
} from '@xyflow/react';
import { useEditorStore, type StepTypeOption } from './store/editor-store';
import { ConditionNode } from './components/condition-node';
import { ActionNode } from './components/action-node';
import { EditorToolbar } from './components/editor-toolbar';
import { SidePanel } from './components/side-panel';
import { ValidationPanel } from './components/validation-panel';
import { isValidConnection as checkCycle } from './lib/is-valid-connection';
import type { GraphNode, GraphEdge } from './lib/types';
import { apiFetch } from '@/lib/api';

const nodeTypes: NodeTypes = {
  CONDITION: ConditionNode,
  ACTION: ActionNode,
};

export function AutomationEditorPage() {
  const [stepTypes, setStepTypes] = useState<StepTypeOption[]>([]);

  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    removeSelected,
    label,
    setLabel,
  } = useEditorStore();

  useEffect(() => {
    apiFetch('/step-types')
      .then((res) => res.json())
      .then(setStepTypes)
      .catch(console.error);
  }, []);

  const handleAddStep = useCallback(
    (stepType: StepTypeOption) => {
      const x = 250 + Math.random() * 200;
      const y = 100 + nodes.length * 120;
      addNode(stepType, { x, y });
    },
    [addNode, nodes.length],
  );

  const handleIsValidConnection = useCallback(
    (connection: Edge | Connection) => {
      const graphNodes: GraphNode[] = nodes.map((n) => ({
        id: n.id,
        type: (n.type as 'CONDITION' | 'ACTION') ?? 'ACTION',
        position: n.position,
        data: {
          stepTypeId: '',
          label: '',
          contractAddress: '',
          selector: '',
          params: {},
        },
      }));
      const graphEdges: GraphEdge[] = edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: (e.sourceHandle as 'true' | 'false' | 'out') ?? 'out',
      }));
      return checkCycle(
        { source: connection.source, target: connection.target },
        graphNodes,
        graphEdges,
      );
    },
    [nodes, edges],
  );

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
        removeSelected();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [removeSelected]);

  const defaultEdgeOptions = useMemo(
    () => ({ type: 'default' as const }),
    [],
  );

  return (
    <div className="h-screen flex flex-col">
      <EditorToolbar
        stepTypes={stepTypes}
        onAddStep={handleAddStep}
        label={label}
        onLabelChange={setLabel}
      />
      <div className="flex-1 flex">
        <div className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            isValidConnection={handleIsValidConnection}
            defaultEdgeOptions={defaultEdgeOptions}
            fitView
            deleteKeyCode={null}
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>
        <SidePanel />
      </div>
      <ValidationPanel />
    </div>
  );
}
