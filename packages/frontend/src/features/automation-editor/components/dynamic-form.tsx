import { memo, useCallback, useState } from 'react';
import type { DurationUnit } from 'shared';
import { type ContextVariable, useEditorStore } from '../store/editor-store';
import { ContextInputField } from './context-input-field';
import { ContextOutputField } from './context-output-field';

const NO_SLOT = 4294967295;

const DURATION_UNITS: { value: DurationUnit; label: string }[] = [
  { value: 'minutes', label: 'Minutes' },
  { value: 'hours', label: 'Hours' },
  { value: 'days', label: 'Days' },
  { value: 'weeks', label: 'Weeks' },
];

interface FieldSchema {
  type: string;
  title?: string;
  description?: string;
  default?: unknown;
  'x-ui-widget'?: string;
  'x-ui-slot-access'?: string;
  'x-ui-hidden'?: boolean;
  'x-ui-time-slot-field'?: string;
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
  nodeId: string;
}

export const DynamicForm = memo(function DynamicForm({
  schema,
  values,
  onChange,
  tokens,
  contextVariables,
  onCreateVariable,
  vaultAddress,
  nodeId,
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
          nodeId={nodeId}
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
  nodeId: string;
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
  nodeId,
}: FormFieldProps) {
  const slotAccess = schema['x-ui-slot-access'];
  const widget = schema['x-ui-widget'];
  const isOptional = schema.default === NO_SLOT;

  // Auto-managed fields (e.g. the time slot seeded by a start-time field) are
  // kept in params but hidden from the friendly UI.
  if (schema['x-ui-hidden']) return null;

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

  if (widget === 'duration') {
    return (
      <DurationField
        fieldName={fieldName}
        schema={schema}
        value={value}
        onChange={onChange}
        nodeId={nodeId}
      />
    );
  }

  if (widget === 'start-time') {
    return (
      <StartTimeField
        fieldName={fieldName}
        schema={schema}
        value={value}
        onChange={onChange}
        nodeId={nodeId}
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

/**
 * Inline per-field error, read from the shared `validationErrors` list (the
 * same source the aggregated panel uses), filtered by nodeId + fieldName.
 */
function useFieldError(nodeId: string, fieldName: string): string | undefined {
  return useEditorStore((s) =>
    s.validationErrors.find(
      (e) => e.nodeId === nodeId && e.fieldName === fieldName,
    )?.message,
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-600">{message}</p>;
}

interface DurationValue {
  value: number | undefined;
  unit: DurationUnit;
}

function asDuration(value: unknown): DurationValue {
  if (value && typeof value === 'object' && 'unit' in value) {
    const v = value as { value?: unknown; unit?: unknown };
    return {
      value: typeof v.value === 'number' ? v.value : undefined,
      unit: (v.unit as DurationUnit) ?? 'days',
    };
  }
  return { value: undefined, unit: 'days' };
}

function DurationField({
  fieldName,
  schema,
  value,
  onChange,
  nodeId,
}: {
  fieldName: string;
  schema: FieldSchema;
  value: unknown;
  onChange: (name: string, value: unknown) => void;
  nodeId: string;
}) {
  const initial = asDuration(value);
  const [amount, setAmount] = useState<string>(
    initial.value !== undefined ? String(initial.value) : '',
  );
  const [unit, setUnit] = useState<DurationUnit>(initial.unit);
  const error = useFieldError(nodeId, fieldName);

  function commit(nextAmount: string, nextUnit: DurationUnit) {
    const parsed = nextAmount.trim() === '' ? undefined : Number(nextAmount);
    onChange(fieldName, { value: parsed, unit: nextUnit });
  }

  return (
    <div>
      <FieldLabel schema={schema} />
      <div className="flex gap-2">
        <input
          type="number"
          min="0"
          step="any"
          className={`nodrag w-24 border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 ${
            error
              ? 'border-red-400 focus:ring-red-500'
              : 'border-gray-300 focus:ring-blue-500'
          }`}
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            commit(e.target.value, unit);
          }}
          placeholder="0"
        />
        <select
          className="nodrag flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          value={unit}
          onChange={(e) => {
            const next = e.target.value as DurationUnit;
            setUnit(next);
            commit(amount, next);
          }}
        >
          {DURATION_UNITS.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </select>
      </div>
      <FieldError message={error} />
    </div>
  );
}

function unixToLocalInput(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function StartTimeField({
  fieldName,
  schema,
  value,
  onChange,
  nodeId,
}: {
  fieldName: string;
  schema: FieldSchema;
  value: unknown;
  onChange: (name: string, value: unknown) => void;
  nodeId: string;
}) {
  const initialUnix =
    typeof value === 'number' ? value : value ? Number(value) : undefined;
  const [local, setLocal] = useState<string>(
    initialUnix !== undefined && Number.isFinite(initialUnix)
      ? unixToLocalInput(initialUnix)
      : '',
  );
  const error = useFieldError(nodeId, fieldName);

  return (
    <div>
      <FieldLabel schema={schema} />
      <input
        type="datetime-local"
        className={`nodrag w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 ${
          error ? 'border-red-400 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'
        }`}
        value={local}
        onChange={(e) => {
          const next = e.target.value;
          setLocal(next);
          if (!next) {
            onChange(fieldName, undefined);
            return;
          }
          const secs = Math.floor(new Date(next).getTime() / 1000);
          onChange(fieldName, Number.isFinite(secs) ? secs : undefined);
        }}
      />
      <FieldError message={error} />
    </div>
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
