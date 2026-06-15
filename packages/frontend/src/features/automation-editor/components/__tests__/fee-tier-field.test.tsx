import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DynamicForm } from '../dynamic-form';
import { useEditorStore } from '../../store/editor-store';

const schema = {
  type: 'object' as const,
  properties: {
    fee: { type: 'integer', title: 'Fee Tier', 'x-ui-widget': 'fee-tier', default: 500 },
  },
  required: ['fee'],
};

function renderForm(values: Record<string, unknown>, onChange = () => {}) {
  return render(
    <DynamicForm
      schema={schema as any}
      values={values}
      onChange={onChange}
      tokens={[]}
      contextVariables={[]}
      onCreateVariable={() => {}}
      vaultAddress="0x0000000000000000000000000000000000000000"
      nodeId="s1"
    />,
  );
}

beforeEach(() => {
  useEditorStore.setState({ validationErrors: [] });
});

describe('FeeTierField widget', () => {
  it('renders the four PancakeSwap fee tiers', () => {
    renderForm({ fee: 500 });
    for (const label of ['0.01%', '0.05%', '0.25%', '1%']) {
      expect(screen.getByRole('option', { name: label })).toBeInTheDocument();
    }
  });

  it('emits the integer tier on change', () => {
    const onChange = vi.fn();
    renderForm({ fee: 500 }, onChange);
    fireEvent.change(screen.getByDisplayValue('0.05%'), { target: { value: '10000' } });
    expect(onChange).toHaveBeenCalledWith({ fee: 10000 });
  });

  it('shows an inline error from the validation list (pool-existence)', () => {
    useEditorStore.setState({
      validationErrors: [
        { message: 'No PancakeSwap pool exists for this token pair and fee tier', nodeId: 's1', fieldName: 'fee' },
      ],
    });
    renderForm({ fee: 100 });
    expect(screen.getByText(/No PancakeSwap pool exists/)).toBeInTheDocument();
  });
});
