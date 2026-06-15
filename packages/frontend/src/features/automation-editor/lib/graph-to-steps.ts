import { DONE, GraphNode, GraphEdge, StepOutput } from './types';

export function graphToSteps(
  nodes: GraphNode[],
  edges: GraphEdge[],
  startNodeId: string,
): StepOutput[] {
  if (nodes.length === 0) return [];

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const edgesBySource = new Map<string, GraphEdge[]>();
  for (const edge of edges) {
    const list = edgesBySource.get(edge.source) ?? [];
    list.push(edge);
    edgesBySource.set(edge.source, list);
  }

  const order: string[] = [];
  const visited = new Set<string>();
  const queue: string[] = [startNodeId];
  visited.add(startNodeId);

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    order.push(nodeId);

    const outEdges = edgesBySource.get(nodeId) ?? [];
    for (const edge of outEdges) {
      if (!visited.has(edge.target)) {
        visited.add(edge.target);
        queue.push(edge.target);
      }
    }
  }

  const indexMap = new Map(order.map((id, i) => [id, i]));

  return order.map((nodeId) => {
    const node = nodeMap.get(nodeId)!;
    const outEdges = edgesBySource.get(nodeId) ?? [];

    let nextOnTrue = DONE;
    let nextOnFalse = DONE;

    if (node.type === 'CONDITION') {
      const trueEdge = outEdges.find((e) => e.sourceHandle === 'true');
      const falseEdge = outEdges.find((e) => e.sourceHandle === 'false');
      if (trueEdge) nextOnTrue = indexMap.get(trueEdge.target) ?? DONE;
      if (falseEdge) nextOnFalse = indexMap.get(falseEdge.target) ?? DONE;
    } else {
      const outEdge = outEdges.find((e) => e.sourceHandle === 'out');
      if (outEdge) nextOnTrue = indexMap.get(outEdge.target) ?? DONE;
      nextOnFalse = DONE;
    }

    return {
      stepType: node.type,
      target: node.data.contractAddress,
      selector: node.data.selector,
      nextOnTrue,
      nextOnFalse,
      data: node.data.params,
    };
  });
}
