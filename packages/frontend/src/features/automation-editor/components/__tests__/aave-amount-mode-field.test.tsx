import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DynamicForm } from '../dynamic-form';
import { useEditorStore } from '../../store/editor-store';

const USDT = '0x55d398326f99059fF775485246999027B3197955';

const schema = {
  type: 'object' as const,
  properties: {
    asset: {
      type: 'string',
      title: 'Token',
      'x-ui-widget': 'token-selector',
      'x-ui-token-source': 'aave',
    },
    mode: {
      type: 'integer',
      title: 'Amount',
      'x-ui-widget': 'aave-amount-mode',
      'x-ui-amount-field': 'amount',
      'x-ui-slot-field': 'amountFromSlot',
    },
    amount: {
      type: 'string',
      title: 'Amount',
      'x-ui-widget': 'token-amount',
      'x-ui-amount-token-field': 'asset',
      'x-ui-hidden': true,
    },
    amountFromSlot: {
      type: 'integer',
      title: 'Amount from Context Slot',
      'x-ui-widget': 'context-slot',
      'x-ui-slot-access': 'read',
      'x-ui-hidden': true,
    },
  },
  required: ['asset', 'mode'],
};

function renderForm(values: Record<string, unknown>, onChange = () => {}) {
  return render(
    <DynamicForm
      schema={schema as any}
      values={values}
      onChange={onChange}
      tokens={[]}
      tokenSources={{ aave: [{ address: USDT, symbol: 'USDT', decimals: 18 }] }}
      contextVariables={[]}
      onCreateVariable={() => {}}
      vaultAddress="0x0000000000000000000000000000000000000000"
      nodeId="a1"
    />,
  );
}

beforeEach(() => {
  useEditorStore.setState({ validationErrors: [] });
});

describe('AaveAmountModeField widget', () => {
  it('renders the curated Aave token list via x-ui-token-source', () => {
    renderForm({ asset: '', mode: 0 });
    expect(screen.getByRole('option', { name: /USDT/ })).toBeInTheDocument();
  });

  it('shows the fixed amount input in FIXED mode (0)', () => {
    renderForm({ asset: USDT, mode: 0, amount: '' });
    expect(screen.getByPlaceholderText('0.0')).toBeInTheDocument();
  });

  it('shows the full-balance note in MAX_AVAILABLE mode (2)', () => {
    renderForm({ asset: USDT, mode: 2 });
    expect(screen.getByText(/entire balance/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('0.0')).not.toBeInTheDocument();
  });

  it('shows the context-slot picker in FROM_SLOT mode (1)', () => {
    renderForm({ asset: USDT, mode: 1, amountFromSlot: 4294967295 });
    // no fixed-amount input in this mode
    expect(screen.queryByPlaceholderText('0.0')).not.toBeInTheDocument();
  });

  it('writes the selected mode as an integer', () => {
    const onChange = vi.fn();
    renderForm({ asset: USDT, mode: 0 }, onChange);
    const select = screen.getByDisplayValue('Fixed amount');
    fireEvent.change(select, { target: { value: '2' } });
    expect(onChange).toHaveBeenCalledWith({ mode: 2 });
  });

  it('disables the TARGET_HF option (coming soon)', () => {
    renderForm({ asset: USDT, mode: 0 });
    const option = screen.getByRole('option', {
      name: /Target health factor/i,
    }) as HTMLOptionElement;
    expect(option.disabled).toBe(true);
  });

  it('overrides the MAX option label + note via x-ui-max-label / x-ui-max-note', () => {
    const withdrawSchema = {
      type: 'object' as const,
      properties: {
        asset: { type: 'string', title: 'Token', 'x-ui-widget': 'token-selector', 'x-ui-token-source': 'aave' },
        mode: {
          type: 'integer',
          title: 'Amount',
          'x-ui-widget': 'aave-amount-mode',
          'x-ui-max-label': 'Withdraw everything',
          'x-ui-max-note': 'Withdraws your entire supplied balance from Aave.',
        },
      },
      required: ['asset', 'mode'],
    };
    render(
      <DynamicForm
        schema={withdrawSchema as any}
        values={{ asset: USDT, mode: 2 }}
        onChange={() => {}}
        tokens={[]}
        tokenSources={{ aave: [{ address: USDT, symbol: 'USDT', decimals: 18 }] }}
        contextVariables={[]}
        onCreateVariable={() => {}}
        vaultAddress="0x0000000000000000000000000000000000000000"
        nodeId="w1"
      />,
    );
    expect(screen.getByRole('option', { name: 'Withdraw everything' })).toBeInTheDocument();
    expect(screen.getByText(/entire supplied balance/i)).toBeInTheDocument();
  });

  it('restricts the offered modes via x-ui-modes (Borrow = FIXED + FROM_SLOT only)', () => {
    const borrowSchema = {
      type: 'object' as const,
      properties: {
        asset: { type: 'string', title: 'Token', 'x-ui-widget': 'token-selector', 'x-ui-token-source': 'aave' },
        mode: {
          type: 'integer',
          title: 'Amount',
          'x-ui-widget': 'aave-amount-mode',
          'x-ui-modes': [0, 1],
        },
      },
      required: ['asset', 'mode'],
    };
    render(
      <DynamicForm
        schema={borrowSchema as any}
        values={{ asset: USDT, mode: 0 }}
        onChange={() => {}}
        tokens={[]}
        tokenSources={{ aave: [{ address: USDT, symbol: 'USDT', decimals: 18 }] }}
        contextVariables={[]}
        onCreateVariable={() => {}}
        vaultAddress="0x0000000000000000000000000000000000000000"
        nodeId="b1"
      />,
    );
    expect(screen.getByRole('option', { name: 'Fixed amount' })).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: /From a previous step/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Full vault balance/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Target health factor/i })).not.toBeInTheDocument();
  });
});
