import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { EditorNodeData } from '../store/editor-store';

export const ConditionNode = memo(function ConditionNode({
  data,
  selected,
}: NodeProps) {
  const nodeData = data as unknown as EditorNodeData;
  return (
    <div
      className={`rounded-lg border-2 bg-white shadow-sm min-w-[180px] ${
        selected ? 'border-blue-600 ring-2 ring-blue-200' : 'border-blue-400'
      }`}
    >
      <Handle type="target" position={Position.Top} className="!w-3 !h-3" />
      <div className="bg-blue-50 px-3 py-1.5 rounded-t-md border-b border-blue-200">
        <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
          Condition
        </span>
      </div>
      <div className="px-3 py-2">
        <span className="text-sm font-medium text-gray-900">
          {nodeData.stepTypeName}
        </span>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        id="true"
        className="!w-3 !h-3 !bg-green-500"
        style={{ left: '30%' }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="false"
        className="!w-3 !h-3 !bg-red-500"
        style={{ left: '70%' }}
      />
    </div>
  );
});
