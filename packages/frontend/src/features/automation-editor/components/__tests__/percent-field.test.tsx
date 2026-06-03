import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DynamicForm } from '../dynamic-form';
import { useEditorStore } from '../../store/editor-store';

const schema = {
  type: 'object' as const,
  properties: {
    percent: { type: 'integer', title: 'Percentage to Remove', 'x-ui-widget': 'percent', default: 100 },
  },
  required: ['percent'],
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
      nodeId="d1"
    />,
  );
}

beforeEach(() => {
  useEditorStore.setState({ validationErrors: [] });
});

describe('PercentField widget', () => {
  it('defaults to 100 and emits an integer percentage on change', () => {
    const onChange = vi.fn();
    renderForm({ percent: 100 }, onChange);
    const input = screen.getByDisplayValue('100');
    fireEvent.change(input, { target: { value: '50' } });
    expect(onChange).toHaveBeenCalledWith({ percent: 50 });
  });

  it('shows an inline error from the validation list', () => {
    useEditorStore.setState({
      validationErrors: [
        { message: 'Percentage to Remove must be a whole number between 1 and 100', nodeId: 'd1', fieldName: 'percent' },
      ],
    });
    renderForm({ percent: 150 });
    expect(screen.getByText(/between 1 and 100/)).toBeInTheDocument();
  });
});
