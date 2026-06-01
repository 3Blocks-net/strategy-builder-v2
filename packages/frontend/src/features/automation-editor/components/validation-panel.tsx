import { useReactFlow } from '@xyflow/react';
import { useEditorStore } from '../store/editor-store';

export function ValidationPanel() {
  const errors = useEditorStore((s) => s.validationErrors);
  const setSelectedNodeId = useEditorStore((s) => s.setSelectedNodeId);
  const { fitView } = useReactFlow();

  if (errors.length === 0) return null;

  return (
    <div className="border-t border-red-200 bg-red-50 max-h-48 overflow-y-auto">
      <div className="px-4 py-2 border-b border-red-200 flex items-center gap-2">
        <span className="text-xs font-semibold text-red-700 uppercase">
          Validation Errors
        </span>
        <span className="bg-red-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
          {errors.length}
        </span>
      </div>
      <ul className="divide-y divide-red-100">
        {errors.map((error, i) => (
          <li key={i} className="px-4 py-2 text-sm text-red-800">
            {error.nodeId ? (
              <button
                className="underline hover:text-red-600 text-left"
                onClick={() => {
                  setSelectedNodeId(error.nodeId!);
                  fitView({
                    nodes: [{ id: error.nodeId! }],
                    duration: 300,
                    padding: 0.5,
                  });
                }}
              >
                {error.message}
              </button>
            ) : (
              <span>{error.message}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
