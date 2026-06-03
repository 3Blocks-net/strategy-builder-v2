import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DynamicForm } from '../dynamic-form';
import { useEditorStore } from '../../store/editor-store';

const schema = {
  type: 'object' as const,
  properties: {
    startTime: {
      type: 'integer',
      title: 'Start Time',
      'x-ui-widget': 'start-time',
      'x-ui-time-slot-field': 'timeSlot',
    },
    // a hidden auto-managed field — must not render
    timeSlot: {
      type: 'integer',
      title: 'Time Slot',
      'x-ui-widget': 'context-slot',
      'x-ui-slot-access': 'read-write',
      'x-ui-hidden': true,
    },
  },
  required: ['timeSlot'],
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

describe('StartTimeField widget', () => {
  it('renders a datetime-local input and hides the auto-managed time slot', () => {
    const { container } = renderForm({ startTime: 1_700_000_000, timeSlot: '__time_c1' }, () => {});
    const input = container.querySelector('input[type="datetime-local"]');
    expect(input).toBeTruthy();
    // the hidden timeSlot field must not appear
    expect(screen.queryByText('Time Slot')).toBeNull();
  });

  it('stores the chosen time as Unix seconds', () => {
    const onChange = vi.fn();
    const { container } = renderForm({ startTime: 1_700_000_000, timeSlot: '__time_c1' }, onChange);
    const input = container.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '2024-01-01T00:00' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    const arg = onChange.mock.calls[0][0] as { startTime: number };
    // local-time interpretation → exact epoch depends on TZ, assert it's an int
    expect(typeof arg.startTime).toBe('number');
    expect(Number.isInteger(arg.startTime)).toBe(true);
    expect(arg.startTime).toBe(Math.floor(new Date('2024-01-01T00:00').getTime() / 1000));
  });
});
