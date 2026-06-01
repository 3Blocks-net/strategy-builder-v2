import { describe, it, expect } from 'vitest';
import { isValidConnection } from '../is-valid-connection';
import { GraphNode, GraphEdge } from '../types';

function makeNode(id: string): GraphNode {
  return {
    id,
    type: 'ACTION',
    position: { x: 0, y: 0 },
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

describe('isValidConnection', () => {
  it('rejects self-connections', () => {
    const nodes = [makeNode('a')];
    const result = isValidConnection(
      { source: 'a', target: 'a' },
      nodes,
      [],
    );
    expect(result).toBe(false);
  });

  it('allows a valid connection', () => {
    const nodes = [makeNode('a'), makeNode('b')];
    const result = isValidConnection(
      { source: 'a', target: 'b' },
      nodes,
      [],
    );
    expect(result).toBe(true);
  });

  it('rejects a direct cycle (a→b, connecting b→a)', () => {
    const nodes = [makeNode('a'), makeNode('b')];
    const edges = [makeEdge('a', 'b')];
    const result = isValidConnection(
      { source: 'b', target: 'a' },
      nodes,
      edges,
    );
    expect(result).toBe(false);
  });

  it('rejects an indirect cycle (a→b→c, connecting c→a)', () => {
    const nodes = [makeNode('a'), makeNode('b'), makeNode('c')];
    const edges = [makeEdge('a', 'b'), makeEdge('b', 'c')];
    const result = isValidConnection(
      { source: 'c', target: 'a' },
      nodes,
      edges,
    );
    expect(result).toBe(false);
  });

  it('allows connection that does not create a cycle', () => {
    const nodes = [makeNode('a'), makeNode('b'), makeNode('c')];
    const edges = [makeEdge('a', 'b')];
    const result = isValidConnection(
      { source: 'a', target: 'c' },
      nodes,
      edges,
    );
    expect(result).toBe(true);
  });

  it('allows parallel paths without cycles', () => {
    const nodes = [
      makeNode('a'),
      makeNode('b'),
      makeNode('c'),
      makeNode('d'),
    ];
    const edges = [makeEdge('a', 'b'), makeEdge('a', 'c')];
    const result = isValidConnection(
      { source: 'b', target: 'd' },
      nodes,
      edges,
    );
    expect(result).toBe(true);
  });
});
