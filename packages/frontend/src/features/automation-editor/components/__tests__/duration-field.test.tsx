import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DynamicForm } from '../dynamic-form';
import { useEditorStore } from '../../store/editor-store';

const schema = {
  type: 'object' as const,
  properties: {
    interval: {
      type: 'object',
      title: 'Interval',
      'x-ui-widget': 'duration',
    },
  },
  required: ['interval'],
};

function renderForm(
  values: Record<string, unknown>,
  onChange: (p: Record<string, unknown>) => void,
) {
  return render(
    <DynamicForm
      schema={schema as any}
      values={values}
      onChange={onChange}
      tokens={[]}
      contextVariables={[]}
      onCreateVariable={() => {}}
      vaultAddress="0x0000000000000000000000000000000000000000"
      nodeId="c1"
    />,
  );
}

beforeEach(() => {
  useEditorStore.setState({ validationErrors: [] });
});

describe('DurationField widget', () => {
  it('stores the entered number as { value, unit }', () => {
    const onChange = vi.fn();
    renderForm({ interval: { value: 1, unit: 'days' } }, onChange);
    const number = screen.getByPlaceholderText('0');
    fireEvent.change(number, { target: { value: '7' } });
    expect(onChange).toHaveBeenCalledWith({ interval: { value: 7, unit: 'days' } });
  });

  it('updates the unit', () => {
    const onChange = vi.fn();
    renderForm({ interval: { value: 7, unit: 'days' } }, onChange);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'hours' } });
    expect(onChange).toHaveBeenCalledWith({ interval: { value: 7, unit: 'hours' } });
  });

  it('round-trips an existing friendly value into the inputs', () => {
    renderForm({ interval: { value: 7, unit: 'days' } }, () => {});
    expect((screen.getByPlaceholderText('0') as HTMLInputElement).value).toBe('7');
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('days');
  });

  it('shows an inline error read from the shared validation list', () => {
    useEditorStore.setState({
      validationErrors: [
        { message: 'Interval must be greater than 0', nodeId: 'c1', fieldName: 'interval' },
      ],
    });
    renderForm({ interval: { value: 0, unit: 'days' } }, () => {});
    expect(screen.getByText(/greater than 0/)).toBeInTheDocument();
  });
});
