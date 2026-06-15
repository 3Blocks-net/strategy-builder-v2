import { describe, it, expect, beforeEach } from 'vitest';
import { zeroToggleField } from 'shared';
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
    tokenDecimals: {},
    vaultAddress: '',
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

// Timer reuses the same duration + start-time infra as Interval (Slice 4).
const timerStepType: StepTypeOption = {
  id: 'st-timer',
  name: 'Timer Condition',
  description: '',
  category: 'CONDITION',
  contractAddress: '0xdef',
  selector: '0xd89f1e36',
  afterExecutionSelector: '0xb2792168',
  paramSchema: {
    type: 'object',
    properties: {
      delta: {
        type: 'object',
        title: 'Delay',
        'x-ui-widget': 'duration',
        default: { value: 30, unit: 'days' },
      },
      startTime: {
        type: 'integer',
        title: 'Start Time',
        'x-ui-widget': 'start-time',
        'x-ui-time-slot-field': 'timeSlot',
      },
      timeSlot: {
        type: 'integer',
        title: 'Time Slot',
        'x-ui-widget': 'context-slot',
        'x-ui-slot-access': 'read-write',
        'x-ui-hidden': true,
      },
    },
    required: ['delta', 'timeSlot'],
  },
  abiFragment: {
    type: 'tuple',
    components: [
      { name: 'delta', type: 'uint256' },
      { name: 'timeSlot', type: 'uint32' },
    ],
  },
};

function timerNode(params: Record<string, unknown>) {
  return {
    id: 't1',
    type: 'CONDITION' as const,
    position: { x: 0, y: 0 },
    data: {
      stepTypeId: 'st-timer',
      stepTypeName: 'Timer Condition',
      category: 'CONDITION' as const,
      contractAddress: '0x',
      selector: '0x',
      params,
    },
  };
}

// TokenBalance amount vertical (Slice 5).
const TOKEN_18 = '0xAAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa';
const VAULT = '0x1111111111111111111111111111111111111111';

const balanceStepType: StepTypeOption = {
  id: 'st-balance',
  name: 'Token Balance Condition',
  description: '',
  category: 'CONDITION',
  contractAddress: '0xbbb',
  selector: '0xd89f1e36',
  afterExecutionSelector: null,
  paramSchema: {
    type: 'object',
    properties: {
      token: { type: 'string', title: 'Token', 'x-ui-widget': 'token-selector' },
      account: { type: 'string', title: 'Account', 'x-ui-widget': 'account-selector' },
      minBalance: {
        type: 'string',
        title: 'Minimum Balance',
        'x-ui-widget': 'token-amount',
        'x-ui-amount-token-field': 'token',
      },
      aboveOrEqual: { type: 'boolean', title: 'Above or Equal', default: true },
    },
    required: ['token', 'account', 'minBalance', 'aboveOrEqual'],
  },
  abiFragment: {
    type: 'tuple',
    components: [
      { name: 'token', type: 'address' },
      { name: 'account', type: 'address' },
      { name: 'minBalance', type: 'uint256' },
      { name: 'aboveOrEqual', type: 'bool' },
    ],
  },
};

function balanceNode(params: Record<string, unknown>) {
  return {
    id: 'b1',
    type: 'CONDITION' as const,
    position: { x: 0, y: 0 },
    data: {
      stepTypeId: 'st-balance',
      stepTypeName: 'Token Balance Condition',
      category: 'CONDITION' as const,
      contractAddress: '0x',
      selector: '0x',
      params,
    },
  };
}

describe('TokenBalance amount + account default (Slice 5)', () => {
  it('node-init defaults account to the vault address and aboveOrEqual to true', () => {
    const params = materializeDefaultParams(balanceStepType.paramSchema, 'b1', VAULT);
    expect(params.account).toBe(VAULT);
    expect(params.aboveOrEqual).toBe(true);
  });

  it('addNode applies the account = vault default without opening the form', () => {
    useEditorStore.setState({ vaultAddress: VAULT });
    useEditorStore.getState().addNode(balanceStepType, { x: 0, y: 0 });
    const node = useEditorStore.getState().nodes.find((n) => n.data.stepTypeId === 'st-balance');
    expect(node?.data.params.account).toBe(VAULT);
  });

  it('flags a missing required token and over-precision via the param pass', () => {
    useEditorStore.setState({
      tokenDecimals: { [TOKEN_18.toLowerCase()]: 18 },
    });
    useEditorStore.getState().setStepSchemas({
      'st-balance': {
        paramSchema: balanceStepType.paramSchema,
        abiFragment: balanceStepType.abiFragment,
      },
    });
    // token empty (required) — should flag token
    useEditorStore.setState({
      nodes: [balanceNode({ token: '', account: VAULT, minBalance: '1.5', aboveOrEqual: true })],
      edges: [],
    });
    useEditorStore.getState().runValidation();
    const tokenErr = useEditorStore
      .getState()
      .validationErrors.find((e) => e.nodeId === 'b1' && e.fieldName === 'token');
    expect(tokenErr).toBeTruthy();
  });

  it('allows minBalance = 0 (no toggle)', () => {
    useEditorStore.setState({ tokenDecimals: { [TOKEN_18.toLowerCase()]: 18 } });
    useEditorStore.getState().setStepSchemas({
      'st-balance': { paramSchema: balanceStepType.paramSchema, abiFragment: balanceStepType.abiFragment },
    });
    useEditorStore.setState({
      nodes: [balanceNode({ token: TOKEN_18, account: VAULT, minBalance: '0', aboveOrEqual: true })],
      edges: [],
    });
    useEditorStore.getState().runValidation();
    const paramErrors = useEditorStore.getState().validationErrors.filter((e) => e.fieldName);
    expect(paramErrors).toEqual([]);
  });
});

// Action amount zero-toggle (Slice 6).
const transferStepType: StepTypeOption = {
  id: 'st-transfer',
  name: 'ERC-20 Transfer',
  description: '',
  category: 'ACTION',
  contractAddress: '0xccc',
  selector: '0x24856bc3',
  afterExecutionSelector: null,
  paramSchema: {
    type: 'object',
    properties: {
      token: { type: 'string', title: 'Token', 'x-ui-widget': 'token-selector' },
      recipient: { type: 'string', title: 'Recipient' },
      amount: {
        type: 'string',
        title: 'Amount',
        'x-ui-widget': 'token-amount',
        'x-ui-amount-token-field': 'token',
        'x-ui-zero-toggle': { label: 'Full vault balance', default: false },
      },
    },
    required: ['token', 'recipient', 'amount'],
  },
  abiFragment: {
    type: 'tuple',
    components: [
      { name: 'token', type: 'address' },
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
  },
};

const feeDepositStepType: StepTypeOption = {
  ...transferStepType,
  id: 'st-feedeposit',
  name: 'Fee Deposit',
  paramSchema: {
    type: 'object',
    properties: {
      token: { type: 'string', 'x-ui-widget': 'token-selector' },
      topUpAmount: {
        type: 'string',
        title: 'Top-up Amount',
        'x-ui-widget': 'token-amount',
        'x-ui-amount-token-field': 'token',
        'x-ui-zero-toggle': { label: 'Fill to target', default: true },
      },
    },
    required: ['token', 'topUpAmount'],
  },
};

describe('Action amount zero-toggle node-init (Slice 6)', () => {
  it('materializes the toggle boolean off by default (ERC20 transfer)', () => {
    const params = materializeDefaultParams(transferStepType.paramSchema, 'a1');
    expect(params[zeroToggleField('amount')]).toBe(false);
  });

  it('materializes the toggle boolean on when the schema default is true (FeeDeposit)', () => {
    const params = materializeDefaultParams(feeDepositStepType.paramSchema, 'a2');
    expect(params[zeroToggleField('topUpAmount')]).toBe(true);
  });

  it('toggle OFF + empty amount flags an error; toggle ON clears it', () => {
    const setSchemas = () =>
      useEditorStore.getState().setStepSchemas({
        'st-transfer': {
          paramSchema: transferStepType.paramSchema,
          abiFragment: transferStepType.abiFragment,
        },
      });

    function node(params: Record<string, unknown>) {
      return {
        id: 'a1',
        type: 'ACTION' as const,
        position: { x: 0, y: 0 },
        data: {
          stepTypeId: 'st-transfer',
          stepTypeName: 'ERC-20 Transfer',
          category: 'ACTION' as const,
          contractAddress: '0x',
          selector: '0x',
          params,
        },
      };
    }

    setSchemas();
    // toggle OFF, amount empty → error
    useEditorStore.setState({
      nodes: [node({ token: '0xtok', recipient: '0xrec', amount: '', [zeroToggleField('amount')]: false })],
      edges: [],
    });
    useEditorStore.getState().runValidation();
    expect(
      useEditorStore.getState().validationErrors.some((e) => e.fieldName === 'amount'),
    ).toBe(true);

    // toggle ON → amount error cleared
    useEditorStore.setState({
      nodes: [node({ token: '0xtok', recipient: '0xrec', amount: '', [zeroToggleField('amount')]: true })],
      edges: [],
    });
    useEditorStore.getState().runValidation();
    expect(
      useEditorStore.getState().validationErrors.some((e) => e.fieldName === 'amount'),
    ).toBe(false);
  });
});

describe('Timer reuses friendly infra (Slice 4)', () => {
  it('node-init materializes delta default, hidden time-slot name, and start-time now', () => {
    const params = materializeDefaultParams(timerStepType.paramSchema, 't1');
    expect(params.delta).toEqual({ value: 30, unit: 'days' });
    expect(params.timeSlot).toBe('__time_t1');
    expect(typeof params.startTime).toBe('number');
  });

  it('flags delta = 0 via the generic duration rule', () => {
    useEditorStore.getState().setStepSchemas({
      'st-timer': {
        paramSchema: timerStepType.paramSchema,
        abiFragment: timerStepType.abiFragment,
      },
    });
    useEditorStore.setState({
      nodes: [timerNode({ delta: { value: 0, unit: 'days' }, timeSlot: '__time_t1' })],
      edges: [],
    });
    useEditorStore.getState().runValidation();
    const err = useEditorStore
      .getState()
      .validationErrors.find((e) => e.nodeId === 't1' && e.fieldName === 'delta');
    expect(err).toBeTruthy();
    expect(err!.message).toMatch(/greater than 0/);
  });
});
