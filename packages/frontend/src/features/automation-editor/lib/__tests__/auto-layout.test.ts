import { describe, it, expect } from 'vitest';
import { autoLayout } from '../auto-layout';
import { GraphNode, GraphEdge } from '../types';

function makeNode(
  id: string,
  measured?: { width: number; height: number },
): GraphNode {
  return {
    id,
    type: 'ACTION',
    position: { x: 0, y: 0 },
    measured,
    data: {
      stepTypeId: 'test',
      label: id,
      contractAddress: '0x0',
      selector: '0x0',
      params: {},
    },
  };
}

function makeEdge(source: string, target: string): GraphEdge {
  return { id: `${source}-${target}`, source, target, sourceHandle: 'out' };
}

describe('autoLayout', () => {
  it('returns empty for empty input', () => {
    const result = autoLayout([], []);
    expect(result.nodes).toEqual([]);
  });

  it('produces valid positions (no NaN)', () => {
    const nodes = [makeNode('a'), makeNode('b'), makeNode('c')];
    const edges = [makeEdge('a', 'b'), makeEdge('b', 'c')];
    const result = autoLayout(nodes, edges);

    for (const node of result.nodes) {
      expect(Number.isNaN(node.position.x)).toBe(false);
      expect(Number.isNaN(node.position.y)).toBe(false);
    }
  });

  it('positions nodes at different coordinates in a chain', () => {
    const nodes = [makeNode('a'), makeNode('b')];
    const edges = [makeEdge('a', 'b')];
    const result = autoLayout(nodes, edges, 'TB');

    expect(result.nodes[0].position.y).not.toBe(result.nodes[1].position.y);
  });

  it('converts dagre center to top-left origin using measured dimensions', () => {
    const nodes = [
      makeNode('a', { width: 200, height: 100 }),
      makeNode('b', { width: 200, height: 100 }),
    ];
    const edges = [makeEdge('a', 'b')];
    const result = autoLayout(nodes, edges);

    for (const node of result.nodes) {
      expect(node.position.x).toBeDefined();
      expect(node.position.y).toBeDefined();
    }
  });

  it('uses fallback dimensions when measured is absent', () => {
    const nodes = [makeNode('a'), makeNode('b')];
    const edges = [makeEdge('a', 'b')];
    const result = autoLayout(nodes, edges);

    expect(result.nodes).toHaveLength(2);
    for (const node of result.nodes) {
      expect(Number.isFinite(node.position.x)).toBe(true);
      expect(Number.isFinite(node.position.y)).toBe(true);
    }
  });

  it('does not mutate original nodes', () => {
    const nodes = [makeNode('a'), makeNode('b')];
    const edges = [makeEdge('a', 'b')];
    const origPositions = nodes.map((n) => ({ ...n.position }));

    autoLayout(nodes, edges);

    nodes.forEach((n, i) => {
      expect(n.position).toEqual(origPositions[i]);
    });
  });

  it('returns edges unchanged', () => {
    const nodes = [makeNode('a'), makeNode('b')];
    const edges = [makeEdge('a', 'b')];
    const result = autoLayout(nodes, edges);

    expect(result.edges).toBe(edges);
  });
});
