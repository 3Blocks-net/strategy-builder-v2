import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
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
import { DeployDialog } from './components/deploy-dialog';
import { useAutoSave } from './hooks/use-auto-save';
import { isValidConnection as checkCycle } from './lib/is-valid-connection';
import type { GraphNode, GraphEdge } from './lib/types';
import { apiFetch } from '@/lib/api';

const nodeTypes: NodeTypes = {
  CONDITION: ConditionNode,
  ACTION: ActionNode,
};

export function AutomationEditorPage() {
  const { address: vaultAddress, id: routeId } = useParams<{ address: string; id: string }>();
  const [stepTypes, setStepTypes] = useState<StepTypeOption[]>([]);
  const [showDeploy, setShowDeploy] = useState(false);
  const [automationId, setAutomationId] = useState<string | null>(routeId === 'new' ? null : routeId ?? null);
  const [isDeployed, setIsDeployed] = useState(false);

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
    loadEditorState,
    undo,
    redo,
    copySelected,
    paste,
  } = useEditorStore();

  useAutoSave(vaultAddress, automationId);

  useEffect(() => {
    apiFetch('/step-types')
      .then((res) => res.json())
      .then(setStepTypes)
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!vaultAddress || !automationId) return;
    apiFetch(`/vaults/${vaultAddress}/automations/${automationId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.editorState?.nodes) {
          loadEditorState({
            nodes: data.editorState.nodes,
            edges: data.editorState.edges ?? [],
            label: data.label,
            description: data.description,
          });
        }
        if (data.onChainId !== null && data.onChainId !== undefined) {
          setIsDeployed(true);
        }
      })
      .catch(() => {});
  }, [automationId]);

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
      const active = document.activeElement;
      const inInput = active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName);
      const mod = e.ctrlKey || e.metaKey;

      if ((e.key === 'Delete' || e.key === 'Backspace') && !inInput) {
        removeSelected();
        return;
      }
      if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (mod && e.key === 'z' && e.shiftKey) { e.preventDefault(); redo(); return; }
      if (mod && e.key === 'Z') { e.preventDefault(); redo(); return; }
      if (mod && e.key === 'c' && !inInput) { e.preventDefault(); copySelected(); return; }
      if (mod && e.key === 'v' && !inInput) { e.preventDefault(); paste(); return; }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [removeSelected, undo, redo, copySelected, paste]);

  const handleDeploy = useCallback(async () => {
    if (!vaultAddress) return;
    try {
      let id = automationId;
      if (!id) {
        const res = await apiFetch(`/vaults/${vaultAddress}/automations`, {
          method: 'POST',
          body: JSON.stringify({ label }),
        });
        const data = await res.json();
        id = data.id;
        setAutomationId(id);
      }
      // Save editor state before encoding
      await apiFetch(`/vaults/${vaultAddress}/automations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          editorState: { nodes, edges },
          label,
        }),
      });
      setShowDeploy(true);
    } catch (err) {
      console.error('Failed to prepare deploy:', err);
    }
  }, [vaultAddress, automationId, label, nodes, edges]);

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
        onDeploy={handleDeploy}
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
      {showDeploy && automationId && (
        <DeployDialog
          automationId={automationId}
          label={label}
          isEdit={isDeployed}
          onClose={() => setShowDeploy(false)}
        />
      )}
    </div>
  );
}
