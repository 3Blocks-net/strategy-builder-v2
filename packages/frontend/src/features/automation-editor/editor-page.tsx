import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router';
import {
  ReactFlow,
  ReactFlowProvider,
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
import { DebugDialog } from './components/debug-dialog';
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
  const draftCreationStarted = useRef(false);

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
    setContextVariables,
    mergeEditorContextVariables,
    mergeVaultContextSlots,
    setStepSchemas,
  } = useEditorStore();

  useAutoSave(vaultAddress, automationId);

  // Reset store on mount
  useEffect(() => {
    loadEditorState({ nodes: [], edges: [], label: '', description: '' });
    setContextVariables([]);
  }, []);

  // Create draft immediately for new automations.
  // Guard with a ref so React StrictMode's double-invoked effect (dev) doesn't
  // POST twice and create a duplicate draft — automationId is still null on the
  // second invocation, so the state check alone is not enough.
  useEffect(() => {
    if (!vaultAddress || automationId || draftCreationStarted.current) return;
    draftCreationStarted.current = true;
    apiFetch(`/vaults/${vaultAddress}/automations`, {
      method: 'POST',
      body: JSON.stringify({ label: '' }),
    })
      .then((r) => r.json())
      .then((data) => setAutomationId(data.id))
      .catch((err) => {
        draftCreationStarted.current = false;
        console.error(err);
      });
  }, [vaultAddress]);

  useEffect(() => {
    apiFetch('/step-types')
      .then((res) => res.json())
      .then((data: StepTypeOption[]) => {
        setStepTypes(data);
        // Feed schemas into the store for node-init, the param-validation pass,
        // and the encode-boundary mapper.
        const schemas: Record<string, { paramSchema?: any; abiFragment?: any }> = {};
        for (const st of data) {
          schemas[st.id] = { paramSchema: st.paramSchema, abiFragment: st.abiFragment };
        }
        setStepSchemas(schemas);
      })
      .catch(console.error);
  }, []);

  // Load context slots from vault
  useEffect(() => {
    if (!vaultAddress) return;
    apiFetch(`/vaults/${vaultAddress}/context-slots`)
      .then((r) => r.json())
      .then((data) => {
        const slots = data.slots ?? {};
        const variables = Object.entries(slots).map(([idx, meta]: [string, any]) => ({
          slotIndex: parseInt(idx, 10),
          name: meta.name,
          type: meta.type ?? 'uint256',
          description: meta.description ?? '',
          createdByAutomationId: meta.createdByAutomationId,
        }));
        // Fill in vault-wide slots without clobbering draft variables that the
        // editorState load may have already restored (these two effects race).
        mergeVaultContextSlots(variables);
      })
      .catch(() => {});
  }, [vaultAddress]);

  // Load editor state for existing automations
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
          if (data.editorState.contextVariables) {
            // Draft variables win over vault slots on conflict; merging (rather
            // than overwriting) keeps this commutative with the context-slots
            // load above regardless of which fetch resolves first.
            mergeEditorContextVariables(data.editorState.contextVariables);
          }
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

  const contextVariables = useEditorStore((s) => s.contextVariables);

  const handleDeploy = useCallback(async () => {
    if (!vaultAddress || !automationId) return;
    try {
      await apiFetch(`/vaults/${vaultAddress}/automations/${automationId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          editorState: { nodes, edges, contextVariables },
          label,
        }),
      });
      setShowDeploy(true);
    } catch (err) {
      console.error('Failed to prepare deploy:', err);
    }
  }, [vaultAddress, automationId, label, nodes, edges, contextVariables]);

  const defaultEdgeOptions = useMemo(
    () => ({ type: 'default' as const }),
    [],
  );

  return (
    <ReactFlowProvider>
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
      <DebugDialog />
    </ReactFlowProvider>
  );
}
