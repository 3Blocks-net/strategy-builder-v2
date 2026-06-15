import { GraphNode, GraphEdge, ValidationError } from './types';

const MAX_STEPS = 256;

export function validateGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  isPublic = true,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (nodes.length === 0) {
    errors.push({ message: 'Graph must have at least one node' });
    return errors;
  }

  if (nodes.length > MAX_STEPS) {
    errors.push({ message: `Graph exceeds maximum of ${MAX_STEPS} steps` });
    return errors;
  }

  const incomingCount = new Map<string, number>();
  for (const node of nodes) incomingCount.set(node.id, 0);
  for (const edge of edges) {
    incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1);
  }

  const startNodes = nodes.filter((n) => incomingCount.get(n.id) === 0);

  if (startNodes.length === 0) {
    errors.push({ message: 'No start node found (all nodes have incoming edges)' });
  } else if (startNodes.length > 1) {
    for (const n of startNodes) {
      errors.push({ message: 'Multiple start nodes detected', nodeId: n.id });
    }
  }

  if (startNodes.length === 1 && isPublic && startNodes[0].type === 'ACTION') {
    errors.push({
      message: 'Public automation must start with a Condition',
      nodeId: startNodes[0].id,
    });
  }

  if (hasCycle(nodes, edges)) {
    errors.push({ message: 'Graph contains a cycle' });
  }

  const edgesBySource = new Map<string, GraphEdge[]>();
  for (const edge of edges) {
    const list = edgesBySource.get(edge.source) ?? [];
    list.push(edge);
    edgesBySource.set(edge.source, list);
  }

  for (const node of nodes) {
    const outEdges = edgesBySource.get(node.id) ?? [];
    if (node.type === 'CONDITION' && outEdges.length === 0) {
      errors.push({
        message: 'Condition must have at least one outgoing edge',
        nodeId: node.id,
      });
    }
    if (node.type === 'ACTION' && outEdges.length > 1) {
      errors.push({
        message: 'Action must have at most one outgoing edge',
        nodeId: node.id,
      });
    }
  }

  if (startNodes.length === 1) {
    const reachable = new Set<string>();
    const queue = [startNodes[0].id];
    reachable.add(startNodes[0].id);
    while (queue.length > 0) {
      const id = queue.shift()!;
      for (const edge of edgesBySource.get(id) ?? []) {
        if (!reachable.has(edge.target)) {
          reachable.add(edge.target);
          queue.push(edge.target);
        }
      }
    }
    for (const node of nodes) {
      if (!reachable.has(node.id)) {
        errors.push({ message: 'Node is unreachable from start', nodeId: node.id });
      }
    }
  }

  return errors;
}

function hasCycle(nodes: GraphNode[], edges: GraphEdge[]): boolean {
  const adj = new Map<string, string[]>();
  for (const node of nodes) adj.set(node.id, []);
  for (const edge of edges) adj.get(edge.source)!.push(edge.target);

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const node of nodes) color.set(node.id, WHITE);

  function dfs(id: string): boolean {
    color.set(id, GRAY);
    for (const neighbor of adj.get(id)!) {
      if (color.get(neighbor) === GRAY) return true;
      if (color.get(neighbor) === WHITE && dfs(neighbor)) return true;
    }
    color.set(id, BLACK);
    return false;
  }

  for (const node of nodes) {
    if (color.get(node.id) === WHITE && dfs(node.id)) return true;
  }
  return false;
}
