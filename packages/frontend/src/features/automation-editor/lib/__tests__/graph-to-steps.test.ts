import { describe, it, expect } from 'vitest';
import { graphToSteps } from '../graph-to-steps';
import { DONE, GraphNode, GraphEdge } from '../types';

function makeNode(
  id: string,
  type: 'CONDITION' | 'ACTION',
  overrides: Partial<GraphNode['data']> = {},
): GraphNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: {
      stepTypeId: `step-${id}`,
      label: `Node ${id}`,
      contractAddress: `0x${id.padStart(40, '0')}`,
      selector: type === 'CONDITION' ? '0xd89f1e36' : '0x24856bc3',
      params: {},
      ...overrides,
    },
  };
}

function makeEdge(
  source: string,
  target: string,
  handle: 'true' | 'false' | 'out',
): GraphEdge {
  return { id: `${source}-${target}`, source, target, sourceHandle: handle };
}

describe('graphToSteps', () => {
  it('returns empty array for empty graph', () => {
    expect(graphToSteps([], [], 'x')).toEqual([]);
  });

  it('converts a single condition node', () => {
    const nodes = [makeNode('c1', 'CONDITION')];
    const result = graphToSteps(nodes, [], 'c1');

    expect(result).toHaveLength(1);
    expect(result[0].stepType).toBe('CONDITION');
    expect(result[0].nextOnTrue).toBe(DONE);
    expect(result[0].nextOnFalse).toBe(DONE);
  });

  it('converts a single action node', () => {
    const nodes = [makeNode('a1', 'ACTION')];
    const result = graphToSteps(nodes, [], 'a1');

    expect(result).toHaveLength(1);
    expect(result[0].stepType).toBe('ACTION');
    expect(result[0].nextOnFalse).toBe(DONE);
  });

  it('converts linear chain: condition → action', () => {
    const nodes = [makeNode('c1', 'CONDITION'), makeNode('a1', 'ACTION')];
    const edges = [makeEdge('c1', 'a1', 'true')];
    const result = graphToSteps(nodes, edges, 'c1');

    expect(result).toHaveLength(2);
    expect(result[0].nextOnTrue).toBe(1);
    expect(result[0].nextOnFalse).toBe(DONE);
    expect(result[1].nextOnTrue).toBe(DONE);
    expect(result[1].nextOnFalse).toBe(DONE);
  });

  it('places start node at index 0', () => {
    const nodes = [makeNode('a1', 'ACTION'), makeNode('c1', 'CONDITION')];
    const edges = [makeEdge('c1', 'a1', 'true')];
    const result = graphToSteps(nodes, edges, 'c1');

    expect(result[0].stepType).toBe('CONDITION');
    expect(result[0].target).toBe(nodes[1].data.contractAddress);
  });

  it('handles condition branching: true → action, false → DONE', () => {
    const nodes = [makeNode('c1', 'CONDITION'), makeNode('a1', 'ACTION')];
    const edges = [makeEdge('c1', 'a1', 'true')];
    const result = graphToSteps(nodes, edges, 'c1');

    expect(result[0].nextOnTrue).toBe(1);
    expect(result[0].nextOnFalse).toBe(DONE);
  });

  it('handles condition branching: true and false paths', () => {
    const nodes = [
      makeNode('c1', 'CONDITION'),
      makeNode('a1', 'ACTION'),
      makeNode('a2', 'ACTION'),
    ];
    const edges = [
      makeEdge('c1', 'a1', 'true'),
      makeEdge('c1', 'a2', 'false'),
    ];
    const result = graphToSteps(nodes, edges, 'c1');

    expect(result[0].nextOnTrue).toBe(1);
    expect(result[0].nextOnFalse).toBe(2);
  });

  it('sets nextOnFalse = DONE for all action nodes', () => {
    const nodes = [
      makeNode('a1', 'ACTION'),
      makeNode('a2', 'ACTION'),
      makeNode('a3', 'ACTION'),
    ];
    const edges = [
      makeEdge('a1', 'a2', 'out'),
      makeEdge('a2', 'a3', 'out'),
    ];
    const result = graphToSteps(nodes, edges, 'a1');

    for (const step of result) {
      expect(step.nextOnFalse).toBe(DONE);
    }
  });

  it('converts diamond: condition → two paths → merge', () => {
    const nodes = [
      makeNode('c1', 'CONDITION'),
      makeNode('a1', 'ACTION'),
      makeNode('a2', 'ACTION'),
      makeNode('a3', 'ACTION'),
    ];
    const edges = [
      makeEdge('c1', 'a1', 'true'),
      makeEdge('c1', 'a2', 'false'),
      makeEdge('a1', 'a3', 'out'),
      makeEdge('a2', 'a3', 'out'),
    ];
    const result = graphToSteps(nodes, edges, 'c1');

    expect(result).toHaveLength(4);
    expect(result[0].nextOnTrue).toBe(1);
    expect(result[0].nextOnFalse).toBe(2);
    const mergeIdx = result.findIndex(
      (s) => s.target === nodes[3].data.contractAddress,
    );
    expect(result[1].nextOnTrue).toBe(mergeIdx);
    expect(result[2].nextOnTrue).toBe(mergeIdx);
  });

  it('passes through node params data as-is', () => {
    const params = { token: '0xabc', amount: '1000', slotName: 'my-slot' };
    const nodes = [makeNode('a1', 'ACTION', { params })];
    const result = graphToSteps(nodes, [], 'a1');

    expect(result[0].data).toEqual(params);
  });

  it('handles a chain of 256 action nodes', () => {
    const nodes = Array.from({ length: 256 }, (_, i) =>
      makeNode(`a${i}`, 'ACTION'),
    );
    const edges = Array.from({ length: 255 }, (_, i) =>
      makeEdge(`a${i}`, `a${i + 1}`, 'out'),
    );
    const result = graphToSteps(nodes, edges, 'a0');

    expect(result).toHaveLength(256);
    expect(result[0].nextOnTrue).toBe(1);
    expect(result[254].nextOnTrue).toBe(255);
    expect(result[255].nextOnTrue).toBe(DONE);
  });
});
