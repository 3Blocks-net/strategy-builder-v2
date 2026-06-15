import { GraphNode, GraphEdge, Connection } from './types';

export function isValidConnection(
  connection: Connection,
  nodes: GraphNode[],
  edges: GraphEdge[],
): boolean {
  if (connection.source === connection.target) return false;

  const adj = new Map<string, string[]>();
  for (const node of nodes) adj.set(node.id, []);
  for (const edge of edges) adj.get(edge.source)!.push(edge.target);

  const visited = new Set<string>();
  const stack = [connection.target];

  while (stack.length > 0) {
    const id = stack.pop()!;
    if (id === connection.source) return false;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const neighbor of adj.get(id) ?? []) {
      stack.push(neighbor);
    }
  }

  return true;
}
