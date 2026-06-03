import { describe, it, expect } from 'vitest';
import { mapParamsToRaw, mapGraphToRaw, type StepSchema } from '../encode-boundary';

const intervalSchema: StepSchema = {
  paramSchema: {
    properties: {
      interval: { type: 'object', 'x-ui-widget': 'duration' },
      timeSlot: { type: 'integer', 'x-ui-widget': 'context-slot' },
      // a friendly-only field NOT present in abiFragment
      startTime: { type: 'integer' },
    },
    required: ['interval', 'timeSlot'],
  },
  abiFragment: {
    type: 'tuple',
    components: [
      { name: 'interval', type: 'uint256' },
      { name: 'timeSlot', type: 'uint32' },
    ],
  },
};

describe('mapParamsToRaw', () => {
  it('converts a friendly duration to raw seconds string', () => {
    const raw = mapParamsToRaw(
      { interval: { value: 7, unit: 'days' }, timeSlot: '__time_n1' },
      intervalSchema,
    );
    expect(raw.interval).toBe('604800');
  });

  it('strips friendly-only fields not in abiFragment', () => {
    const raw = mapParamsToRaw(
      { interval: { value: 1, unit: 'minutes' }, timeSlot: '__time_n1', startTime: 123 },
      intervalSchema,
    );
    expect(Object.keys(raw).sort()).toEqual(['interval', 'timeSlot']);
    expect('startTime' in raw).toBe(false);
  });

  it('passes the context-slot variable name through untouched', () => {
    const raw = mapParamsToRaw(
      { interval: { value: 90, unit: 'minutes' }, timeSlot: '__time_n1' },
      intervalSchema,
    );
    expect(raw.timeSlot).toBe('__time_n1');
    expect(raw.interval).toBe('5400');
  });

  it('omits unset fields so the backend can apply its defaults', () => {
    const raw = mapParamsToRaw({ interval: { value: 1, unit: 'days' } }, intervalSchema);
    expect('timeSlot' in raw).toBe(false);
  });

  it('returns {} for an unknown step schema', () => {
    expect(mapParamsToRaw({ interval: { value: 1, unit: 'days' } }, undefined)).toEqual({});
  });
});

describe('mapGraphToRaw', () => {
  it('maps every node and normalises edges', () => {
    const graph = mapGraphToRaw(
      [
        {
          id: 'c1',
          type: 'CONDITION',
          data: { stepTypeId: 'st-interval', params: { interval: { value: 7, unit: 'days' }, timeSlot: '__time_c1' } },
        },
      ],
      [{ source: 'c1', target: 'a1', sourceHandle: 'true' }],
      { 'st-interval': intervalSchema },
    );

    expect(graph.nodes[0].data.params.interval).toBe('604800');
    expect(graph.nodes[0].type).toBe('CONDITION');
    expect(graph.edges[0]).toEqual({ source: 'c1', target: 'a1', sourceHandle: 'true' });
  });

  it('defaults a missing sourceHandle to "out"', () => {
    const graph = mapGraphToRaw(
      [{ id: 'a1', type: 'ACTION', data: { stepTypeId: 'st-x', params: {} } }],
      [{ source: 'a1', target: 'a2', sourceHandle: null }],
      {},
    );
    expect(graph.edges[0].sourceHandle).toBe('out');
  });
});
