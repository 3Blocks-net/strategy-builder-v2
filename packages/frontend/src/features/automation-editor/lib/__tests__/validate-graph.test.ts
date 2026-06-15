import { describe, it, expect } from 'vitest';
import { validateGraph } from '../validate-graph';
import { GraphNode, GraphEdge } from '../types';

function makeNode(id: string, type: 'CONDITION' | 'ACTION'): GraphNode {
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
    },
  };
}

function makeEdge(
  source: string,
  target: string,
  handle: 'true' | 'false' | 'out' = 'out',
): GraphEdge {
  return { id: `${source}-${target}`, source, target, sourceHandle: handle };
}

describe('validateGraph', () => {
  it('returns empty array for a valid simple graph', () => {
    const nodes = [makeNode('c1', 'CONDITION'), makeNode('a1', 'ACTION')];
    const edges = [makeEdge('c1', 'a1', 'true')];

    expect(validateGraph(nodes, edges)).toEqual([]);
  });

  it('detects empty graph', () => {
    const errors = validateGraph([], []);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/at least one node/);
  });

  it('detects no start node (all have incoming edges = cycle)', () => {
    const nodes = [makeNode('a1', 'ACTION'), makeNode('a2', 'ACTION')];
    const edges = [makeEdge('a1', 'a2', 'out'), makeEdge('a2', 'a1', 'out')];
    const errors = validateGraph(nodes, edges);

    expect(errors.some((e) => e.message.match(/no start node/i))).toBe(true);
  });

  it('detects multiple start nodes', () => {
    const nodes = [
      makeNode('c1', 'CONDITION'),
      makeNode('c2', 'CONDITION'),
      makeNode('a1', 'ACTION'),
    ];
    const edges = [
      makeEdge('c1', 'a1', 'true'),
      makeEdge('c2', 'a1', 'true'),
    ];
    const errors = validateGraph(nodes, edges);

    expect(errors.some((e) => e.message.match(/multiple start/i))).toBe(true);
  });

  it('detects public automation starting with action', () => {
    const nodes = [makeNode('a1', 'ACTION')];
    const errors = validateGraph(nodes, [], true);

    expect(
      errors.some((e) => e.message.match(/must start with a condition/i)),
    ).toBe(true);
  });

  it('allows owner-only automation starting with action', () => {
    const nodes = [makeNode('a1', 'ACTION')];
    const errors = validateGraph(nodes, [], false);

    expect(
      errors.some((e) => e.message.match(/must start with a condition/i)),
    ).toBe(false);
  });

  it('detects cycles', () => {
    const nodes = [
      makeNode('c1', 'CONDITION'),
      makeNode('a1', 'ACTION'),
      makeNode('a2', 'ACTION'),
    ];
    const edges = [
      makeEdge('c1', 'a1', 'true'),
      makeEdge('a1', 'a2', 'out'),
      makeEdge('a2', 'c1', 'out'),
    ];
    const errors = validateGraph(nodes, edges);

    expect(errors.some((e) => e.message.match(/cycle/i))).toBe(true);
  });

  it('detects condition with no outgoing edges', () => {
    const nodes = [makeNode('c1', 'CONDITION'), makeNode('c2', 'CONDITION')];
    const edges = [makeEdge('c1', 'c2', 'true')];
    const errors = validateGraph(nodes, edges);

    expect(
      errors.some(
        (e) =>
          e.message.match(/at least one outgoing/) && e.nodeId === 'c2',
      ),
    ).toBe(true);
  });

  it('detects action with more than one outgoing edge', () => {
    const nodes = [
      makeNode('c1', 'CONDITION'),
      makeNode('a1', 'ACTION'),
      makeNode('a2', 'ACTION'),
      makeNode('a3', 'ACTION'),
    ];
    const edges = [
      makeEdge('c1', 'a1', 'true'),
      makeEdge('a1', 'a2', 'out'),
      makeEdge('a1', 'a3', 'out'),
    ];
    const errors = validateGraph(nodes, edges);

    expect(
      errors.some(
        (e) => e.message.match(/at most one outgoing/) && e.nodeId === 'a1',
      ),
    ).toBe(true);
  });

  it('detects orphan/unreachable nodes', () => {
    // c1 → a1 is the main graph. a2 has an incoming edge from a1
    // but is also fed back to itself via a3 — creating a cluster
    // that won't be detected as extra start nodes.
    // Actually simpler: just make a2 receive from a1 false branch,
    // and add an unconnected node with a self-referencing incoming edge.
    // Simplest approach: node a2 is pointed to by nobody reachable.
    // We need it to NOT be a start node: give it an incoming edge from a3,
    // and a3 an incoming edge from a2 (cycle, but that's separate).
    const nodesWithOrphans = [
      makeNode('c1', 'CONDITION'),
      makeNode('a1', 'ACTION'),
      makeNode('a2', 'ACTION'),
      makeNode('a3', 'ACTION'),
    ];
    const edges = [
      makeEdge('c1', 'a1', 'true'),
      // orphan cycle: a2 ↔ a3 (both have incoming, neither reachable from c1)
      makeEdge('a2', 'a3', 'out'),
      makeEdge('a3', 'a2', 'out'),
    ];
    const errors = validateGraph(nodesWithOrphans, edges);

    // Will have cycle error AND unreachable errors
    expect(
      errors.some(
        (e) => e.message.match(/unreachable/) && e.nodeId === 'a2',
      ),
    ).toBe(true);
    expect(
      errors.some(
        (e) => e.message.match(/unreachable/) && e.nodeId === 'a3',
      ),
    ).toBe(true);
  });

  it('detects exceeding 256 nodes', () => {
    const nodes = Array.from({ length: 257 }, (_, i) =>
      makeNode(`a${i}`, 'ACTION'),
    );
    const errors = validateGraph(nodes, [], false);

    expect(errors.some((e) => e.message.match(/256/))).toBe(true);
  });

  it('returns empty for a valid branching graph', () => {
    const nodes = [
      makeNode('c1', 'CONDITION'),
      makeNode('a1', 'ACTION'),
      makeNode('a2', 'ACTION'),
    ];
    const edges = [
      makeEdge('c1', 'a1', 'true'),
      makeEdge('c1', 'a2', 'false'),
    ];

    expect(validateGraph(nodes, edges)).toEqual([]);
  });
});
