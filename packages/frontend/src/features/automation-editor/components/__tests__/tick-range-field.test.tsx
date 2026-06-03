import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DynamicForm } from '../dynamic-form';
import { useEditorStore } from '../../store/editor-store';

const A = '0x1111111111111111111111111111111111111111';
const B = '0x2222222222222222222222222222222222222222';

const schema = {
  type: 'object' as const,
  properties: {
    rangeMode: {
      type: 'integer',
      title: 'Price Range',
      'x-ui-widget': 'tick-range',
      'x-ui-token0-field': 'tokenA',
      'x-ui-token1-field': 'tokenB',
      'x-ui-fee-field': 'fee',
      'x-ui-tick-lower-field': 'tickLower',
      'x-ui-tick-upper-field': 'tickUpper',
      'x-ui-tick-delta-field': 'tickDelta',
      default: 1,
    },
    tickLower: { type: 'integer', 'x-ui-hidden': true },
    tickUpper: { type: 'integer', 'x-ui-hidden': true },
    tickDelta: { type: 'integer', 'x-ui-hidden': true },
  },
  required: ['rangeMode'],
};

function renderForm(values: Record<string, unknown>, onChange = () => {}) {
  return render(
    <DynamicForm
      schema={schema as any}
      values={{ tokenA: A, tokenB: B, fee: 500, ...values }}
      onChange={onChange}
      tokens={[]}
      contextVariables={[]}
      onCreateVariable={() => {}}
      vaultAddress="0x0000000000000000000000000000000000000000"
      nodeId="m1"
    />,
  );
}

beforeEach(() => {
  useEditorStore.setState({ validationErrors: [], tokenDecimals: { [A]: 18, [B]: 18 } });
});

describe('TickRangeField widget', () => {
  it('defaults to preset mode and emits rangeMode 1 + a tickDelta on width change', () => {
    const onChange = vi.fn();
    renderForm({ rangeMode: 1 }, onChange);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '20' } });
    expect(onChange).toHaveBeenCalledWith({ rangeMode: 1 });
    // a tickDelta was emitted (non-zero integer)
    const deltaCall = onChange.mock.calls.find((c) => 'tickDelta' in c[0]);
    expect(deltaCall?.[0].tickDelta).toBeGreaterThan(0);
  });

  it('switches to explicit mode and emits rangeMode 0 + computed ticks', () => {
    const onChange = vi.fn();
    renderForm({ rangeMode: 1 }, onChange);
    fireEvent.click(screen.getByText('Explicit prices'));
    fireEvent.change(screen.getByPlaceholderText('Min price'), { target: { value: '1.1' } });
    fireEvent.change(screen.getByPlaceholderText('Max price'), { target: { value: '1.3' } });

    expect(onChange).toHaveBeenCalledWith({ rangeMode: 0 });
    const lowerCall = onChange.mock.calls.find((c) => 'tickLower' in c[0]);
    const upperCall = onChange.mock.calls.find((c) => 'tickUpper' in c[0]);
    expect(lowerCall?.[0].tickLower).toBeLessThan(upperCall?.[0].tickUpper);
  });

  it('shows an inline error from the validation list (tickLower >= tickUpper)', () => {
    useEditorStore.setState({
      validationErrors: [
        { message: 'The upper price must be greater than the lower price', nodeId: 'm1', fieldName: 'tickUpper' },
      ],
      tokenDecimals: { [A]: 18, [B]: 18 },
    });
    renderForm({ rangeMode: 0 });
    expect(screen.getByText(/upper price must be greater/i)).toBeInTheDocument();
  });
});
