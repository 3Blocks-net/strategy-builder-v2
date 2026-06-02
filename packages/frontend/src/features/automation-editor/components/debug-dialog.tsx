import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useEditorStore } from '../store/editor-store';
import { graphToSteps } from '../lib/graph-to-steps';
import type { GraphNode, GraphEdge } from '../lib/types';

export function DebugDialog() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'editor' | 'steps'>('editor');
  const nodes = useEditorStore((s) => s.nodes);
  const edges = useEditorStore((s) => s.edges);
  const label = useEditorStore((s) => s.label);
  const description = useEditorStore((s) => s.description);
  const validationErrors = useEditorStore((s) => s.validationErrors);
  const ownerOnly = useEditorStore((s) => s.ownerOnly);

  if (import.meta.env.PROD) return null;

  const editorState = { nodes, edges, label, description, ownerOnly, validationErrors };

  let steps: unknown = null;
  if (tab === 'steps' && nodes.length > 0) {
    try {
      const graphNodes: GraphNode[] = nodes.map((n) => ({
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
      const graphEdges: GraphEdge[] = edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: (e.sourceHandle as 'true' | 'false' | 'out') ?? 'out',
      }));

      const incomingCount = new Map<string, number>();
      for (const n of graphNodes) incomingCount.set(n.id, 0);
      for (const e of graphEdges)
        incomingCount.set(e.target, (incomingCount.get(e.target) ?? 0) + 1);
      const startNode = graphNodes.find((n) => incomingCount.get(n.id) === 0);

      if (startNode) {
        steps = graphToSteps(graphNodes, graphEdges, startNode.id);
      }
    } catch (err) {
      steps = { error: String(err) };
    }
  }

  const json = tab === 'editor' ? editorState : steps;

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="fixed bottom-4 right-4 z-50 bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white text-xs font-mono opacity-60 hover:opacity-100"
        onClick={() => setOpen(true)}
      >
        {'{ }'}
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-lg shadow-xl w-[800px] max-w-[90vw] max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-200">Debug: Automation State</span>
            <span className="text-xs text-gray-500 font-mono">DEV ONLY</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              className={`text-xs px-2 py-1 rounded ${tab === 'editor' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200'}`}
              onClick={() => setTab('editor')}
            >
              Editor State
            </button>
            <button
              className={`text-xs px-2 py-1 rounded ${tab === 'steps' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200'}`}
              onClick={() => setTab('steps')}
            >
              Steps Output
            </button>
            <button
              className="text-xs px-2 py-1 rounded text-gray-400 hover:text-gray-200"
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(json, null, 2));
              }}
            >
              Copy
            </button>
            <button
              className="text-gray-400 hover:text-white text-lg leading-none px-1"
              onClick={() => setOpen(false)}
            >
              x
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">
            {JSON.stringify(json, null, 2)}
          </pre>
        </div>
        <div className="px-4 py-2 border-t border-gray-700 text-xs text-gray-500">
          {nodes.length} nodes, {edges.length} edges, {validationErrors.length} errors
        </div>
      </div>
    </div>
  );
}
