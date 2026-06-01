import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { useEditorStore } from '../store/editor-store';
import { DynamicForm } from './dynamic-form';
import { apiFetch } from '@/lib/api';

interface StepTypeDetail {
  id: string;
  name: string;
  category: string;
  paramSchema: Record<string, unknown>;
}

interface ContextSlotInfo {
  name: string;
  createdByAutomationId: string;
}

export function SidePanel() {
  const { address: vaultAddress } = useParams<{ address: string }>();
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId);
  const nodes = useEditorStore((s) => s.nodes);
  const updateNodeParams = useEditorStore((s) => s.updateNodeParams);

  const [stepTypeDetail, setStepTypeDetail] = useState<StepTypeDetail | null>(null);
  const [contextSlots, setContextSlots] = useState<Record<string, ContextSlotInfo>>({});
  const [tokens, setTokens] = useState<{ address: string; symbol: string }[]>([]);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  useEffect(() => {
    apiFetch('/blockchain/tokens/accepted')
      .then((r) => r.json())
      .then(setTokens)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!vaultAddress) return;
    apiFetch(`/vaults/${vaultAddress}/context-slots`)
      .then((r) => r.json())
      .then((data) => setContextSlots(data.slots ?? {}))
      .catch(() => {});
  }, [vaultAddress]);

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

  if (!selectedNode || !selectedNodeId) return null;

  return (
    <div className="w-80 border-l border-gray-200 bg-white overflow-y-auto flex flex-col">
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
      <div className="flex-1 px-4 py-3">
        {stepTypeDetail?.paramSchema ? (
          <DynamicForm
            key={selectedNodeId}
            schema={stepTypeDetail.paramSchema as any}
            values={selectedNode.data.params}
            onChange={(params) => updateNodeParams(selectedNodeId, params)}
            tokens={tokens}
            contextSlots={contextSlots}
            vaultAddress={vaultAddress ?? ''}
          />
        ) : (
          <p className="text-sm text-gray-500">Loading configuration...</p>
        )}
      </div>
    </div>
  );
}
