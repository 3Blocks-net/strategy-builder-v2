import dagre from '@dagrejs/dagre';
import { GraphNode, GraphEdge } from './types';

const DEFAULT_WIDTH = 200;
const DEFAULT_HEIGHT = 80;
const NODE_SEP = 50;
const RANK_SEP = 80;

export function autoLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  direction: 'TB' | 'LR' = 'TB',
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  if (nodes.length === 0) return { nodes: [], edges };

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: NODE_SEP, ranksep: RANK_SEP });

  for (const node of nodes) {
    const width = node.measured?.width ?? DEFAULT_WIDTH;
    const height = node.measured?.height ?? DEFAULT_HEIGHT;
    g.setNode(node.id, { width, height });
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const dagreNode = g.node(node.id);
    const width = node.measured?.width ?? DEFAULT_WIDTH;
    const height = node.measured?.height ?? DEFAULT_HEIGHT;
    return {
      ...node,
      position: {
        x: dagreNode.x - width / 2,
        y: dagreNode.y - height / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}
