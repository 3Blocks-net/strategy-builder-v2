import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { useEditorStore } from '../store/editor-store';
import { DynamicForm } from './dynamic-form';
import { ContextPanel } from './context-panel';
import { apiFetch } from '@/lib/api';

interface StepTypeDetail {
  id: string;
  name: string;
  category: string;
  paramSchema: Record<string, unknown>;
}

export function SidePanel() {
  const { address: vaultAddress } = useParams<{ address: string }>();
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId);
  const nodes = useEditorStore((s) => s.nodes);
  const updateNodeParams = useEditorStore((s) => s.updateNodeParams);
  const contextVariables = useEditorStore((s) => s.contextVariables);
  const addContextVariable = useEditorStore((s) => s.addContextVariable);
  const activeTab = useEditorStore((s) => s.activeTab);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);

  const [stepTypeDetail, setStepTypeDetail] = useState<StepTypeDetail | null>(null);
  const [tokens, setTokens] = useState<{ address: string; symbol: string; decimals?: number }[]>([]);
  const [tokenSources, setTokenSources] = useState<
    Record<string, { address: string; symbol: string; decimals?: number }[]>
  >({});

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  useEffect(() => {
    apiFetch('/tokens/accepted')
      .then((r) => r.json())
      .then((data) => setTokens(data.tokens ?? []))
      .catch(() => {});
    // Curated per-protocol lists for token-selector fields with an
    // `x-ui-token-source` hint (Aave reserves, PancakeSwap pairs).
    apiFetch('/tokens?protocol=aave')
      .then((r) => r.json())
      .then((data) => setTokenSources((prev) => ({ ...prev, aave: data.tokens ?? [] })))
      .catch(() => {});
    apiFetch('/tokens?protocol=pancakeswap')
      .then((r) => r.json())
      .then((data) => setTokenSources((prev) => ({ ...prev, pancakeswap: data.tokens ?? [] })))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedNode) {
      setStepTypeDetail(null);
      return;
    }
    apiFetch(`/step-types/${selectedNode.data.stepTypeId}`)
      .then((r) => r.json())
      .then(setStepTypeDetail)
      .catch(() => setStepTypeDetail(null));
  }, [selectedNode?.data.stepTypeId]);

  return (
    <div className="w-80 border-l border-gray-200 bg-white flex flex-col">
      {/* Tab bar */}
      <div className="flex border-b border-gray-200">
        <button
          className={`flex-1 px-4 py-2 text-xs font-medium ${
            activeTab === 'config'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('config')}
        >
          Node Config
        </button>
        <button
          className={`flex-1 px-4 py-2 text-xs font-medium ${
            activeTab === 'context'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('context')}
        >
          Context
          {contextVariables.length > 0 && (
            <span className="ml-1.5 bg-gray-200 text-gray-600 text-[10px] font-bold rounded-full px-1.5 py-0.5">
              {contextVariables.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'config' ? (
        <div className="flex-1 overflow-y-auto">
          {selectedNode && selectedNodeId ? (
            <>
              <div className="px-4 py-3 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-semibold uppercase px-2 py-0.5 rounded ${
                      selectedNode.data.category === 'CONDITION'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {selectedNode.data.category}
                  </span>
                  <span className="text-sm font-medium text-gray-900">
                    {selectedNode.data.stepTypeName}
                  </span>
                </div>
              </div>
              <div className="px-4 py-3">
                {stepTypeDetail?.paramSchema ? (
                  <DynamicForm
                    key={selectedNodeId}
                    schema={stepTypeDetail.paramSchema as any}
                    values={selectedNode.data.params}
                    onChange={(params) => updateNodeParams(selectedNodeId, params)}
                    tokens={tokens}
                    tokenSources={tokenSources}
                    contextVariables={contextVariables}
                    onCreateVariable={addContextVariable}
                    vaultAddress={vaultAddress ?? ''}
                    nodeId={selectedNodeId}
                  />
                ) : (
                  <p className="text-sm text-gray-500">Loading configuration...</p>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-400 p-8">
              Wähle einen Node um seine Parameter zu konfigurieren
            </div>
          )}
        </div>
      ) : (
        <ContextPanel />
      )}
    </div>
  );
}
