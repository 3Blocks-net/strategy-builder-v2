import { describe, it, expect, beforeEach } from 'vitest';
import {
  useEditorStore,
  materializeDefaultParams,
  type StepTypeOption,
} from '../editor-store';

const intervalStepType: StepTypeOption = {
  id: 'st-interval',
  name: 'Interval Condition',
  description: '',
  category: 'CONDITION',
  contractAddress: '0xabc',
  selector: '0xd89f1e36',
  afterExecutionSelector: '0xb2792168',
  paramSchema: {
    type: 'object',
    properties: {
      interval: {
        type: 'object',
        title: 'Interval',
        'x-ui-widget': 'duration',
        default: { value: 1, unit: 'days' },
      },
      timeSlot: {
        type: 'integer',
        title: 'Time Slot',
        'x-ui-widget': 'context-slot',
        'x-ui-slot-access': 'read-write',
      },
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

function intervalNode(params: Record<string, unknown>) {
  return {
    id: 'c1',
    type: 'CONDITION' as const,
    position: { x: 0, y: 0 },
    data: {
      stepTypeId: 'st-interval',
      stepTypeName: 'Interval Condition',
      category: 'CONDITION' as const,
      contractAddress: '0x',
      selector: '0x',
      params,
    },
  };
}

beforeEach(() => {
  useEditorStore.setState({
    nodes: [],
    edges: [],
    validationErrors: [],
    stepSchemas: {},
    past: [],
    future: [],
  });
});

describe('materializeDefaultParams (node-init)', () => {
  it('copies static defaults and names the read-write time slot', () => {
    const params = materializeDefaultParams(intervalStepType.paramSchema, 'node-7');
    expect(params.interval).toEqual({ value: 1, unit: 'days' });
    expect(params.timeSlot).toBe('__time_node-7');
  });
});

describe('addNode node-init', () => {
  it('materializes a self-complete param set on creation', () => {
    useEditorStore.getState().addNode(intervalStepType, { x: 0, y: 0 });
    const node = useEditorStore.getState().nodes[0];
    expect(node.data.params.interval).toEqual({ value: 1, unit: 'days' });
    expect(String(node.data.params.timeSlot)).toMatch(/^__time_/);
  });
});

describe('param-validation pass (Deploy gate)', () => {
  function setStepSchemas() {
    useEditorStore.getState().setStepSchemas({
      'st-interval': {
        paramSchema: intervalStepType.paramSchema,
        abiFragment: intervalStepType.abiFragment,
      },
    });
  }

  it('flags interval = 0 on a never-opened node', () => {
    setStepSchemas();
    useEditorStore.setState({
      nodes: [intervalNode({ interval: { value: 0, unit: 'days' }, timeSlot: '__time_c1' })],
      edges: [],
    });
    useEditorStore.getState().runValidation();
    const err = useEditorStore
      .getState()
      .validationErrors.find((e) => e.nodeId === 'c1' && e.fieldName === 'interval');
    expect(err).toBeTruthy();
    expect(err!.message).toMatch(/greater than 0/);
  });

  it('produces no param errors for a valid interval', () => {
    setStepSchemas();
    useEditorStore.setState({
      nodes: [intervalNode({ interval: { value: 7, unit: 'days' }, timeSlot: '__time_c1' })],
      edges: [],
    });
    useEditorStore.getState().runValidation();
    const paramErrors = useEditorStore
      .getState()
      .validationErrors.filter((e) => e.fieldName);
    expect(paramErrors).toEqual([]);
  });
});
