import { memo, useCallback, useState } from 'react';

const NO_SLOT = 4294967295;

interface FieldSchema {
  type: string;
  title?: string;
  description?: string;
  default?: unknown;
  'x-ui-widget'?: string;
  'x-ui-slot-access'?: string;
}

interface FormSchema {
  type: 'object';
  properties: Record<string, FieldSchema>;
  required?: string[];
}

interface ContextSlotInfo {
  name: string;
  createdByAutomationId: string;
}

interface DynamicFormProps {
  schema: FormSchema;
  values: Record<string, unknown>;
  onChange: (params: Record<string, unknown>) => void;
  tokens: { address: string; symbol: string }[];
  contextSlots: Record<string, ContextSlotInfo>;
  vaultAddress: string;
}

export const DynamicForm = memo(function DynamicForm({
  schema,
  values,
  onChange,
  tokens,
  contextSlots,
  vaultAddress,
}: DynamicFormProps) {
  const properties = schema.properties ?? {};

  const handleFieldChange = useCallback(
    (fieldName: string, value: unknown) => {
      onChange({ [fieldName]: value });
    },
    [onChange],
  );

  return (
    <div className="space-y-4">
      {Object.entries(properties).map(([fieldName, fieldSchema]) => (
        <FormField
          key={fieldName}
          fieldName={fieldName}
          schema={fieldSchema}
          value={values[fieldName]}
          onChange={handleFieldChange}
          tokens={tokens}
          contextSlots={contextSlots}
          vaultAddress={vaultAddress}
        />
      ))}
    </div>
  );
});

interface FormFieldProps {
  fieldName: string;
  schema: FieldSchema;
  value: unknown;
  onChange: (name: string, value: unknown) => void;
  tokens: { address: string; symbol: string }[];
  contextSlots: Record<string, ContextSlotInfo>;
  vaultAddress: string;
}

function FormField({
  fieldName,
  schema,
  value,
  onChange,
  tokens,
  contextSlots,
  vaultAddress,
}: FormFieldProps) {
  const widget = schema['x-ui-widget'];
  const isSlotField = widget === 'context-slot';
  const hasDefault = schema.default === NO_SLOT;

  if (isSlotField && hasDefault) {
    return (
      <SlotToggleField
        fieldName={fieldName}
        schema={schema}
        value={value}
        onChange={onChange}
        contextSlots={contextSlots}
      />
    );
  }

  if (isSlotField) {
    return (
      <ContextSlotField
        fieldName={fieldName}
        schema={schema}
        value={value as string | undefined}
        onChange={onChange}
        contextSlots={contextSlots}
      />
    );
  }

  if (widget === 'token-selector') {
    return (
      <TokenSelectorField
        fieldName={fieldName}
        schema={schema}
        value={value as string | undefined}
        onChange={onChange}
        tokens={tokens}
      />
    );
  }

  if (widget === 'account-selector') {
    return (
      <TextInputField
        fieldName={fieldName}
        schema={schema}
        value={(value as string) ?? vaultAddress}
        onChange={onChange}
        placeholder={vaultAddress}
      />
    );
  }

  if (widget === 'amount') {
    return (
      <TextInputField
        fieldName={fieldName}
        schema={schema}
        value={value as string | undefined}
        onChange={onChange}
        placeholder="0"
      />
    );
  }

  if (schema.type === 'boolean') {
    return (
      <CheckboxField
        fieldName={fieldName}
        schema={schema}
        value={value as boolean | undefined}
        onChange={onChange}
      />
    );
  }

  return (
    <TextInputField
      fieldName={fieldName}
      schema={schema}
      value={value as string | undefined}
      onChange={onChange}
    />
  );
}

function FieldLabel({ schema }: { schema: FieldSchema }) {
  return (
    <div className="mb-1">
      <label className="text-xs font-medium text-gray-700">
        {schema.title}
      </label>
      {schema.description && (
        <p className="text-xs text-gray-400 mt-0.5">{schema.description}</p>
      )}
    </div>
  );
}

function TextInputField({
  fieldName,
  schema,
  value,
  onChange,
  placeholder,
}: {
  fieldName: string;
  schema: FieldSchema;
  value: string | undefined;
  onChange: (name: string, value: unknown) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <FieldLabel schema={schema} />
      <input
        type="text"
        className="nodrag w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        defaultValue={value ?? (schema.default as string) ?? ''}
        onBlur={(e) => onChange(fieldName, e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function CheckboxField({
  fieldName,
  schema,
  value,
  onChange,
}: {
  fieldName: string;
  schema: FieldSchema;
  value: boolean | undefined;
  onChange: (name: string, value: unknown) => void;
}) {
  return (
    <div>
      <FieldLabel schema={schema} />
      <label className="nodrag flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          className="rounded"
          defaultChecked={value ?? (schema.default as boolean) ?? false}
          onChange={(e) => onChange(fieldName, e.target.checked)}
        />
        <span className="text-sm text-gray-700">{schema.title}</span>
      </label>
    </div>
  );
}

function TokenSelectorField({
  fieldName,
  schema,
  value,
  onChange,
  tokens,
}: {
  fieldName: string;
  schema: FieldSchema;
  value: string | undefined;
  onChange: (name: string, value: unknown) => void;
  tokens: { address: string; symbol: string }[];
}) {
  return (
    <div>
      <FieldLabel schema={schema} />
      <select
        className="nodrag w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        defaultValue={value ?? ''}
        onChange={(e) => onChange(fieldName, e.target.value)}
      >
        <option value="">Select token...</option>
        {tokens.map((t) => (
          <option key={t.address} value={t.address}>
            {t.symbol} ({t.address.slice(0, 6)}...{t.address.slice(-4)})
          </option>
        ))}
      </select>
    </div>
  );
}

function ContextSlotField({
  fieldName,
  schema,
  value,
  onChange,
  contextSlots,
}: {
  fieldName: string;
  schema: FieldSchema;
  value: string | undefined;
  onChange: (name: string, value: unknown) => void;
  contextSlots: Record<string, ContextSlotInfo>;
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const slotEntries = Object.entries(contextSlots);

  if (creating) {
    return (
      <div>
        <FieldLabel schema={schema} />
        <div className="flex gap-1">
          <input
            type="text"
            className="nodrag flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Slot name..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoFocus
          />
          <button
            className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
            onClick={() => {
              if (newName.trim()) {
                onChange(fieldName, newName.trim());
                setCreating(false);
                setNewName('');
              }
            }}
          >
            Add
          </button>
          <button
            className="px-2 py-1 text-xs bg-gray-200 rounded hover:bg-gray-300"
            onClick={() => {
              setCreating(false);
              setNewName('');
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <FieldLabel schema={schema} />
      <select
        className="nodrag w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        defaultValue={value ?? ''}
        onChange={(e) => {
          if (e.target.value === '__create__') {
            setCreating(true);
          } else {
            onChange(fieldName, e.target.value);
          }
        }}
      >
        <option value="">Select slot...</option>
        {slotEntries.map(([idx, meta]) => (
          <option key={idx} value={meta.name}>
            {meta.name} (Slot {idx})
          </option>
        ))}
        <option value="__create__">+ Create new slot</option>
      </select>
    </div>
  );
}

function SlotToggleField({
  fieldName,
  schema,
  value,
  onChange,
  contextSlots,
}: {
  fieldName: string;
  schema: FieldSchema;
  value: unknown;
  onChange: (name: string, value: unknown) => void;
  contextSlots: Record<string, ContextSlotInfo>;
}) {
  const isUsingSlot = typeof value === 'string' && value !== '';

  return (
    <div>
      <FieldLabel schema={schema} />
      <div className="flex items-center gap-2 mb-2">
        <label className="nodrag flex items-center gap-1 cursor-pointer text-xs text-gray-600">
          <input
            type="radio"
            name={`${fieldName}-mode`}
            checked={!isUsingSlot}
            onChange={() => onChange(fieldName, NO_SLOT)}
          />
          Use static value
        </label>
        <label className="nodrag flex items-center gap-1 cursor-pointer text-xs text-gray-600">
          <input
            type="radio"
            name={`${fieldName}-mode`}
            checked={isUsingSlot}
            onChange={() => onChange(fieldName, '')}
          />
          From context slot
        </label>
      </div>
      {isUsingSlot && (
        <ContextSlotField
          fieldName={fieldName}
          schema={schema}
          value={value}
          onChange={onChange}
          contextSlots={contextSlots}
        />
      )}
    </div>
  );
}
