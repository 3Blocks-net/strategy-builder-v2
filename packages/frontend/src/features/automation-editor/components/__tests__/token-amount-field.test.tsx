import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DynamicForm } from '../dynamic-form';
import { useEditorStore } from '../../store/editor-store';

const TOKEN = '0xAAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa';

const schema = {
  type: 'object' as const,
  properties: {
    token: { type: 'string', title: 'Token', 'x-ui-widget': 'token-selector' },
    minBalance: {
      type: 'string',
      title: 'Minimum Balance',
      'x-ui-widget': 'token-amount',
      'x-ui-amount-token-field': 'token',
    },
  },
  required: ['token', 'minBalance'],
};

function renderForm(values: Record<string, unknown>, onChange = () => {}) {
  return render(
    <DynamicForm
      schema={schema as any}
      values={values}
      onChange={onChange}
      tokens={[{ address: TOKEN, symbol: 'USDT', decimals: 6 }]}
      contextVariables={[]}
      onCreateVariable={() => {}}
      vaultAddress="0x0000000000000000000000000000000000000000"
      nodeId="b1"
    />,
  );
}

beforeEach(() => {
  useEditorStore.setState({ validationErrors: [] });
});

describe('TokenAmountField widget', () => {
  it('stores the entered human amount as a string', () => {
    const onChange = vi.fn();
    renderForm({ token: TOKEN, minBalance: '' }, onChange);
    const input = screen.getByPlaceholderText('0.0');
    fireEvent.change(input, { target: { value: '1.5' } });
    expect(onChange).toHaveBeenCalledWith({ minBalance: '1.5' });
  });

  it('shows the selected token symbol and decimals used', () => {
    renderForm({ token: TOKEN, minBalance: '1.5' });
    // helper text is unique (the symbol also appears in the token <option>)
    expect(screen.getByText(/USDT · converts using 6 decimals/)).toBeInTheDocument();
  });

  it('prompts to select a token when none is chosen', () => {
    renderForm({ token: '', minBalance: '1.5' });
    expect(screen.getByText(/Select a token/)).toBeInTheDocument();
  });

  it('shows an inline error from the shared validation list', () => {
    useEditorStore.setState({
      validationErrors: [
        { message: 'Minimum Balance allows at most 6 decimal places', nodeId: 'b1', fieldName: 'minBalance' },
      ],
    });
    renderForm({ token: TOKEN, minBalance: '1.1234567' });
    expect(screen.getByText(/at most 6 decimal places/)).toBeInTheDocument();
  });
});
