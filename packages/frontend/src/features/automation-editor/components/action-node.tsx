import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { EditorNodeData } from '../store/editor-store';

export const ActionNode = memo(function ActionNode({
  data,
  selected,
}: NodeProps) {
  const nodeData = data as unknown as EditorNodeData;
  return (
    <div
      className={`rounded-lg border-2 bg-white shadow-sm min-w-[180px] ${
        selected ? 'border-amber-600 ring-2 ring-amber-200' : 'border-amber-400'
      }`}
    >
      <Handle type="target" position={Position.Top} className="!w-3 !h-3" />
      <div className="bg-amber-50 px-3 py-1.5 rounded-t-md border-b border-amber-200">
        <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
          Action
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
        id="out"
        className="!w-3 !h-3 !bg-gray-400"
      />
    </div>
  );
});
