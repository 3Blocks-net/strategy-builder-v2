import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ContextOutputField } from '../context-output-field';

const NO_SLOT = 4294967295;

function renderField(value: unknown, onChange = vi.fn(), variables = [] as any[]) {
  const utils = render(
    <ContextOutputField
      fieldName="amountToSlot"
      title="Amount to Context Slot"
      value={value}
      onChange={onChange}
      contextVariables={variables}
      onCreateVariable={() => {}}
    />,
  );
  return { ...utils, onChange };
}

const checkbox = () => screen.getByRole('checkbox') as HTMLInputElement;

describe('ContextOutputField — save-output toggle', () => {
  it('is unchecked and shows no picker when the slot is NO_SLOT (off)', () => {
    renderField(NO_SLOT);
    expect(checkbox().checked).toBe(false);
    expect(screen.queryByText('+ Neue Variable erstellen')).toBeNull();
  });

  it('treats the empty-string (pending) state as active/checked (regression)', () => {
    renderField('');
    expect(checkbox().checked).toBe(true);
  });

  it('ticking the box switches the field into the pending ("") state', () => {
    const { onChange } = renderField(NO_SLOT);
    fireEvent.click(checkbox());
    expect(onChange).toHaveBeenCalledWith('amountToSlot', '');
  });

  it('after ticking, the variable picker is shown once the value becomes ""', () => {
    const onChange = vi.fn();
    const { rerender } = renderField(NO_SLOT, onChange);
    fireEvent.click(checkbox()); // sets showDropdown=true + onChange('')
    // parent applies the new value
    rerender(
      <ContextOutputField
        fieldName="amountToSlot"
        title="Amount to Context Slot"
        value=""
        onChange={onChange}
        contextVariables={[]}
        onCreateVariable={() => {}}
      />,
    );
    expect(checkbox().checked).toBe(true);
    expect(screen.getByText('+ Neue Variable erstellen')).toBeInTheDocument();
  });

  it('renders the ctx chip when a variable is selected', () => {
    renderField('mySlot', vi.fn(), [
      { slotIndex: 0, name: 'mySlot', type: 'uint256', description: '' },
    ]);
    expect(checkbox().checked).toBe(true);
    expect(screen.getByText('mySlot')).toBeInTheDocument();
  });

  it('unchecking resets the field to NO_SLOT', () => {
    const { onChange } = renderField('mySlot', vi.fn(), [
      { slotIndex: 0, name: 'mySlot', type: 'uint256', description: '' },
    ]);
    fireEvent.click(checkbox());
    expect(onChange).toHaveBeenCalledWith('amountToSlot', NO_SLOT);
  });
});
