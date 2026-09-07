import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DynamicForm } from '../dynamic-form';
import { useEditorStore } from '../../store/editor-store';

/**
 * The tolerance is a mandatory step parameter the chain enforces. The editor
 * must let a user set it without knowing what a basis point is — and it must
 * take its limits from the step schema, never from its own copy.
 */
const schema = {
  type: 'object' as const,
  properties: {
    slippageToleranceBps: {
      type: 'integer',
      title: 'Max. Slippage',
      'x-ui-widget': 'slippage-tolerance',
      minimum: 10,
      maximum: 1000,
      default: 100,
    },
    twapWindow: {
      type: 'integer',
      title: 'Reference Window',
      'x-ui-widget': 'twap-window',
      minimum: 60,
      maximum: 900,
      default: 300,
    },
  },
  required: ['slippageToleranceBps', 'twapWindow'],
};

function renderForm(
  values: Record<string, unknown>,
  onChange: (params: Record<string, unknown>) => void = () => {},
  formSchema: unknown = schema,
) {
  return render(
    <DynamicForm
      schema={formSchema as any}
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

describe('slippage tolerance field', () => {
  it('offers the tolerance in percent, not in raw basis points', () => {
    renderForm({ slippageToleranceBps: 100, twapWindow: 300 });
    expect(screen.getByRole('button', { name: '1%' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '0.5%' })).toBeInTheDocument();
  });

  it('emits basis points when a percent preset is picked', () => {
    const onChange = vi.fn();
    renderForm({ slippageToleranceBps: 100, twapWindow: 300 }, onChange);
    fireEvent.click(screen.getByRole('button', { name: '3%' }));
    expect(onChange).toHaveBeenCalledWith({ slippageToleranceBps: 300 });
  });

  it('explains the effect and states the range the schema allows', () => {
    renderForm({ slippageToleranceBps: 100, twapWindow: 300 });
    expect(screen.getByText(/reverts if it would land more than 1%/i)).toBeInTheDocument();
    expect(screen.getByText(/Allowed: 0\.1%–10%/)).toBeInTheDocument();
  });

  it('hides a preset the schema does not allow (limits come from the schema)', () => {
    const narrowed = {
      ...schema,
      properties: {
        ...schema.properties,
        slippageToleranceBps: { ...schema.properties.slippageToleranceBps, maximum: 100 },
      },
    };
    renderForm({ slippageToleranceBps: 100, twapWindow: 300 }, () => {}, narrowed);
    expect(screen.queryByRole('button', { name: '3%' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1%' })).toBeInTheDocument();
  });

  it('shows the inline validation error for the field', () => {
    useEditorStore.setState({
      validationErrors: [
        {
          message: 'Max. Slippage must be between 0.1% and 10%',
          nodeId: 's1',
          fieldName: 'slippageToleranceBps',
        },
      ],
    });
    renderForm({ slippageToleranceBps: 5, twapWindow: 300 });
    expect(screen.getByText(/must be between 0.1% and 10%/)).toBeInTheDocument();
  });
});

describe('reference window field', () => {
  it('offers the window in minutes and emits seconds', () => {
    const onChange = vi.fn();
    renderForm({ slippageToleranceBps: 100, twapWindow: 300 }, onChange);
    fireEvent.click(screen.getByRole('button', { name: '10 min' }));
    expect(onChange).toHaveBeenCalledWith({ twapWindow: 600 });
  });

  it('states the range the schema allows', () => {
    renderForm({ slippageToleranceBps: 100, twapWindow: 300 });
    expect(screen.getByText(/Allowed: 60–900 s/)).toBeInTheDocument();
  });

  it("reaches the schema's own edges through the free input, not just the presets", () => {
    // The presets are 3/5/10 minutes. Without a free field the range the chain
    // actually allows (60 s … 900 s) would be unreachable in the editor.
    const onChange = vi.fn();
    renderForm({ slippageToleranceBps: 100, twapWindow: 300 }, onChange);

    fireEvent.change(screen.getByPlaceholderText('sec …'), { target: { value: '900' } });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ twapWindow: 900 }));
  });

  it('highlights nothing while a required value is unset', () => {
    // An old saved graph carries no tolerance. Showing the schema default as
    // the active choice would contradict the "is required" error on the same
    // field — the user would see 1% selected and be told to pick a value.
    renderForm({});

    for (const label of ['0.5%', '1%', '3%', '3 min', '5 min', '10 min']) {
      const button = screen.queryByRole('button', { name: label });
      if (button) expect(button.className).not.toContain('bg-blue-500');
    }
  });
});
