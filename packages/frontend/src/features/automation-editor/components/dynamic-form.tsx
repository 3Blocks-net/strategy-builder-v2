import { memo, useCallback } from 'react';
import type { ContextVariable } from '../store/editor-store';
import { ContextInputField } from './context-input-field';
import { ContextOutputField } from './context-output-field';

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

interface DynamicFormProps {
  schema: FormSchema;
  values: Record<string, unknown>;
  onChange: (params: Record<string, unknown>) => void;
  tokens: { address: string; symbol: string }[];
  contextVariables: ContextVariable[];
  onCreateVariable: (variable: { name: string; type: string; description: string }) => void;
  vaultAddress: string;
}

export const DynamicForm = memo(function DynamicForm({
  schema,
  values,
  onChange,
  tokens,
  contextVariables,
  onCreateVariable,
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
          contextVariables={contextVariables}
          onCreateVariable={onCreateVariable}
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
  contextVariables: ContextVariable[];
  onCreateVariable: (variable: { name: string; type: string; description: string }) => void;
  vaultAddress: string;
}

function FormField({
  fieldName,
  schema,
  value,
  onChange,
  tokens,
  contextVariables,
  onCreateVariable,
  vaultAddress,
}: FormFieldProps) {
  const slotAccess = schema['x-ui-slot-access'];
  const widget = schema['x-ui-widget'];
  const isOptional = schema.default === NO_SLOT;

  if (slotAccess === 'write') {
    return (
      <ContextOutputField
        fieldName={fieldName}
        title={schema.title}
        description={schema.description}
        value={value}
        onChange={onChange}
        contextVariables={contextVariables}
        onCreateVariable={onCreateVariable}
      />
    );
  }

  if (slotAccess === 'read' || slotAccess === 'read-write') {
    return (
      <ContextInputField
        fieldName={fieldName}
        title={schema.title}
        description={schema.description}
        value={value}
        onChange={onChange}
        contextVariables={contextVariables}
        onCreateVariable={onCreateVariable}
        isOptional={isOptional}
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
      <label className="text-xs font-medium text-gray-700">{schema.title}</label>
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
