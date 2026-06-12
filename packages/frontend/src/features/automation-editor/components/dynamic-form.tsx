import { memo, useCallback, useState } from 'react';
import { zeroToggleField, type DurationUnit } from 'shared';
import { type ContextVariable, useEditorStore } from '../store/editor-store';
import { ContextInputField } from './context-input-field';
import { ContextOutputField } from './context-output-field';
import { computeExplicitTicks, presetTickDelta, tickDeltaToPct } from '../lib/ticks';

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
  'x-ui-amount-token-field'?: string;
  'x-ui-zero-toggle'?: { label?: string };
  // Per-protocol curated token list for token-selector (default: accepted).
  'x-ui-token-source'?: string;
  // aave-amount-mode composite: names of the sibling fields it drives.
  'x-ui-amount-field'?: string;
  'x-ui-slot-field'?: string;
  'x-ui-target-hf-field'?: string;
  // aave-amount-mode: override the MAX_AVAILABLE option label + note per action
  // (Supply = "Full vault balance"; Withdraw = "Withdraw everything").
  'x-ui-max-label'?: string;
  'x-ui-max-note'?: string;
  // aave-amount-mode: restrict the offered modes (e.g. Borrow = [0, 1] — no
  // oracle-bound MAX_AVAILABLE / TARGET_HF yet). Default: all four.
  'x-ui-modes'?: number[];
  // tick-range composite: the sibling fields it drives.
  'x-ui-token0-field'?: string;
  'x-ui-token1-field'?: string;
  'x-ui-fee-field'?: string;
  'x-ui-tick-lower-field'?: string;
  'x-ui-tick-upper-field'?: string;
  'x-ui-tick-delta-field'?: string;
}

export type TokenList = { address: string; symbol: string; decimals?: number }[];

interface FormSchema {
  type: 'object';
  properties: Record<string, FieldSchema>;
  required?: string[];
}

interface DynamicFormProps {
  schema: FormSchema;
  values: Record<string, unknown>;
  onChange: (params: Record<string, unknown>) => void;
  tokens: TokenList;
  /** Per-protocol curated token lists, keyed by `x-ui-token-source`. */
  tokenSources?: Record<string, TokenList>;
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
  tokenSources,
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
          properties={properties}
          value={values[fieldName]}
          allValues={values}
          onChange={handleFieldChange}
          tokens={tokens}
          tokenSources={tokenSources}
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
  properties: Record<string, FieldSchema>;
  value: unknown;
  allValues: Record<string, unknown>;
  onChange: (name: string, value: unknown) => void;
  tokens: TokenList;
  tokenSources?: Record<string, TokenList>;
  contextVariables: ContextVariable[];
  onCreateVariable: (variable: { name: string; type: string; description: string }) => void;
  vaultAddress: string;
  nodeId: string;
}

function resolveTokenList(
  schema: FieldSchema,
  tokens: TokenList,
  tokenSources?: Record<string, TokenList>,
): TokenList {
  const source = schema['x-ui-token-source'];
  if (source && tokenSources?.[source]) return tokenSources[source];
  return tokens;
}

function FormField({
  fieldName,
  schema,
  properties,
  value,
  allValues,
  onChange,
  tokens,
  tokenSources,
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
        tokens={resolveTokenList(schema, tokens, tokenSources)}
      />
    );
  }

  if (widget === 'aave-amount-mode') {
    return (
      <AaveAmountModeField
        fieldName={fieldName}
        schema={schema}
        properties={properties}
        value={value}
        allValues={allValues}
        onChange={onChange}
        tokens={tokens}
        tokenSources={tokenSources}
        contextVariables={contextVariables}
        onCreateVariable={onCreateVariable}
        nodeId={nodeId}
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

  if (widget === 'tick-range') {
    return (
      <TickRangeField
        fieldName={fieldName}
        schema={schema}
        value={value}
        allValues={allValues}
        onChange={onChange}
        nodeId={nodeId}
      />
    );
  }

  if (widget === 'percent') {
    return (
      <PercentField
        fieldName={fieldName}
        schema={schema}
        value={value}
        onChange={onChange}
        nodeId={nodeId}
      />
    );
  }

  if (widget === 'fee-tier') {
    return (
      <FeeTierField
        fieldName={fieldName}
        schema={schema}
        value={value}
        onChange={onChange}
        nodeId={nodeId}
      />
    );
  }

  if (widget === 'range-percent') {
    return (
      <RangePercentField
        fieldName={fieldName}
        schema={schema}
        value={value}
        onChange={onChange}
        nodeId={nodeId}
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

  if (widget === 'token-amount') {
    return (
      <TokenAmountField
        fieldName={fieldName}
        schema={schema}
        value={value}
        onChange={onChange}
        nodeId={nodeId}
        tokens={tokens}
        allValues={allValues}
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

function TokenAmountField({
  fieldName,
  schema,
  value,
  onChange,
  nodeId,
  tokens,
  allValues,
}: {
  fieldName: string;
  schema: FieldSchema;
  value: unknown;
  onChange: (name: string, value: unknown) => void;
  nodeId: string;
  tokens: { address: string; symbol: string; decimals?: number }[];
  allValues: Record<string, unknown>;
}) {
  const error = useFieldError(nodeId, fieldName);
  const [amount, setAmount] = useState<string>(
    typeof value === 'string' ? value : value != null ? String(value) : '',
  );

  const amountTokenField = schema['x-ui-amount-token-field'];
  const tokenAddr =
    amountTokenField && typeof allValues[amountTokenField] === 'string'
      ? (allValues[amountTokenField] as string)
      : undefined;
  const token = tokenAddr
    ? tokens.find((t) => t.address.toLowerCase() === tokenAddr.toLowerCase())
    : undefined;

  const zeroToggle = schema['x-ui-zero-toggle'];
  const toggleKey = zeroToggleField(fieldName);
  const toggleOn = allValues[toggleKey] === true;

  return (
    <div>
      <FieldLabel schema={schema} />
      {zeroToggle && (
        <label className="nodrag mb-1.5 flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="rounded"
            checked={toggleOn}
            onChange={(e) => onChange(toggleKey, e.target.checked)}
          />
          <span className="text-sm text-gray-700">{zeroToggle.label ?? 'Use default'}</span>
        </label>
      )}
      <input
        type="text"
        inputMode="decimal"
        disabled={toggleOn}
        className={`nodrag w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 ${
          error ? 'border-red-400 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'
        } ${toggleOn ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''}`}
        value={toggleOn ? '' : amount}
        onChange={(e) => {
          setAmount(e.target.value);
          onChange(fieldName, e.target.value);
        }}
        placeholder={toggleOn ? zeroToggle?.label ?? '' : '0.0'}
      />
      {!toggleOn &&
        (token ? (
          <p className="mt-0.5 text-xs text-gray-400">
            {token.symbol} · converts using {token.decimals ?? '?'} decimals
          </p>
        ) : (
          <p className="mt-0.5 text-xs text-amber-600">
            Select a token to set the conversion decimals
          </p>
        ))}
      <FieldError message={error} />
    </div>
  );
}

const AAVE_AMOUNT_MODES: { value: number; label: string; disabled?: boolean }[] = [
  { value: 0, label: 'Fixed amount' },
  { value: 1, label: 'From a previous step (context slot)' },
  { value: 2, label: 'Full vault balance' },
  { value: 3, label: 'Target health factor' },
];

const DEFAULT_MAX_NOTE = "Supplies the vault's entire balance of the selected token.";

/**
 * `aave-amount-mode` composite: a mode selector that conditionally reveals the
 * matching sub-input — the fixed amount (FIXED), the context-slot picker
 * (FROM_SLOT), an info note (MAX_AVAILABLE = full vault balance), or a disabled
 * TARGET_HF option (HF/oracle slice). The driven sibling fields (`amount`,
 * `amountFromSlot`) are `x-ui-hidden` in the schema so they render only here.
 */
function AaveAmountModeField({
  fieldName,
  schema,
  properties,
  value,
  allValues,
  onChange,
  tokens,
  tokenSources,
  contextVariables,
  onCreateVariable,
  nodeId,
}: {
  fieldName: string;
  schema: FieldSchema;
  properties: Record<string, FieldSchema>;
  value: unknown;
  allValues: Record<string, unknown>;
  onChange: (name: string, value: unknown) => void;
  tokens: TokenList;
  tokenSources?: Record<string, TokenList>;
  contextVariables: ContextVariable[];
  onCreateVariable: (variable: { name: string; type: string; description: string }) => void;
  nodeId: string;
}) {
  const mode = value === undefined || value === null ? 0 : Number(value);
  const amountField = schema['x-ui-amount-field'] ?? 'amount';
  const slotField = schema['x-ui-slot-field'] ?? 'amountFromSlot';
  const hfField = schema['x-ui-target-hf-field'] ?? 'targetHealthFactor';
  const maxLabel = schema['x-ui-max-label'];
  const maxNote = schema['x-ui-max-note'] ?? DEFAULT_MAX_NOTE;
  const allowedModes = schema['x-ui-modes'];
  const modeOptions = allowedModes
    ? AAVE_AMOUNT_MODES.filter((m) => allowedModes.includes(m.value))
    : AAVE_AMOUNT_MODES;

  const mergedTokens: TokenList = [tokens, ...Object.values(tokenSources ?? {})].flat();

  return (
    <div>
      <FieldLabel schema={schema} />
      <select
        className="nodrag w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        value={String(mode)}
        onChange={(e) => onChange(fieldName, Number(e.target.value))}
      >
        {modeOptions.map((m) => (
          <option key={m.value} value={m.value} disabled={m.disabled}>
            {m.value === 2 && maxLabel ? maxLabel : m.label}
          </option>
        ))}
      </select>

      <div className="mt-2">
        {mode === 0 && properties[amountField] && (
          <TokenAmountField
            fieldName={amountField}
            schema={properties[amountField]}
            value={allValues[amountField]}
            onChange={onChange}
            nodeId={nodeId}
            tokens={mergedTokens}
            allValues={allValues}
          />
        )}
        {mode === 1 && (
          <ContextInputField
            fieldName={slotField}
            title={properties[slotField]?.title}
            description={properties[slotField]?.description}
            value={allValues[slotField]}
            onChange={onChange}
            contextVariables={contextVariables}
            onCreateVariable={onCreateVariable}
            isOptional={false}
          />
        )}
        {mode === 2 && <p className="text-xs text-gray-500">{maxNote}</p>}
        {mode === 3 && (
          <HealthFactorField
            fieldName={hfField}
            value={allValues[hfField]}
            onChange={onChange}
            nodeId={nodeId}
          />
        )}
      </div>
    </div>
  );
}

/** Friendly target health-factor input (e.g. 1.5). Mapped → 1.5e18 at encode. */
function HealthFactorField({
  fieldName,
  value,
  onChange,
  nodeId,
}: {
  fieldName: string;
  value: unknown;
  onChange: (name: string, value: unknown) => void;
  nodeId: string;
}) {
  const error = useFieldError(nodeId, fieldName);
  const [hf, setHf] = useState<string>(
    typeof value === 'string' && value !== '0' ? value : value && value !== 0 ? String(value) : '',
  );
  return (
    <div>
      <label className="text-xs font-medium text-gray-700">Target health factor</label>
      <p className="text-xs text-gray-400 mt-0.5 mb-1">
        Move the position toward this health factor (must be above 1.05). No-op if already past it.
      </p>
      <input
        type="text"
        inputMode="decimal"
        className={`nodrag w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 ${
          error ? 'border-red-400 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'
        }`}
        value={hf}
        onChange={(e) => {
          setHf(e.target.value);
          onChange(fieldName, e.target.value);
        }}
        placeholder="1.5"
      />
      <FieldError message={error} />
    </div>
  );
}

const PRESET_WIDTHS = [5, 10, 20];

/**
 * `tick-range` composite: a rangeMode toggle exposing EITHER explicit min/max
 * price inputs (computes `tickLower`/`tickUpper` off-chain, rounded outward) OR
 * a preset ±% width (computes a `tickDelta` constant; centering is on-chain).
 * The friendly price/width inputs are stripped at the encode boundary (not in
 * the abiFragment); only rangeMode + ticks/tickDelta are carried.
 */
function TickRangeField({
  fieldName,
  schema,
  value,
  allValues,
  onChange,
  nodeId,
}: {
  fieldName: string;
  schema: FieldSchema;
  value: unknown;
  allValues: Record<string, unknown>;
  onChange: (name: string, value: unknown) => void;
  nodeId: string;
}) {
  const tokenDecimals = useEditorStore((s) => s.tokenDecimals);
  const error = useFieldError(nodeId, schema['x-ui-tick-upper-field'] ?? 'tickUpper');

  const token0Field = schema['x-ui-token0-field'] ?? 'tokenA';
  const token1Field = schema['x-ui-token1-field'] ?? 'tokenB';
  const feeField = schema['x-ui-fee-field'] ?? 'fee';
  const lowerField = schema['x-ui-tick-lower-field'] ?? 'tickLower';
  const upperField = schema['x-ui-tick-upper-field'] ?? 'tickUpper';
  const deltaField = schema['x-ui-tick-delta-field'] ?? 'tickDelta';

  const initialMode = value === undefined || value === null ? (schema.default as number) ?? 1 : Number(value);
  const [mode, setMode] = useState<number>(initialMode);
  const [minPrice, setMinPrice] = useState<string>('');
  const [maxPrice, setMaxPrice] = useState<string>('');
  const [pct, setPct] = useState<number>(10);

  function decimalsOf(addr: unknown): number {
    return typeof addr === 'string' ? tokenDecimals[addr.toLowerCase()] ?? 18 : 18;
  }

  function applyExplicit(nextMin: string, nextMax: string) {
    onChange(fieldName, 0);
    const min = Number(nextMin);
    const max = Number(nextMax);
    const tokenA = allValues[token0Field];
    const tokenB = allValues[token1Field];
    if (
      Number.isFinite(min) &&
      Number.isFinite(max) &&
      min > 0 &&
      max > 0 &&
      typeof tokenA === 'string' &&
      typeof tokenB === 'string' &&
      tokenA &&
      tokenB
    ) {
      const { tickLower, tickUpper } = computeExplicitTicks({
        minPrice: min,
        maxPrice: max,
        tokenA,
        tokenB,
        decA: decimalsOf(tokenA),
        decB: decimalsOf(tokenB),
        fee: Number(allValues[feeField] ?? 500),
      });
      onChange(lowerField, tickLower);
      onChange(upperField, tickUpper);
    }
  }

  function applyPreset(nextPct: number) {
    onChange(fieldName, 1);
    onChange(deltaField, presetTickDelta(nextPct));
  }

  return (
    <div>
      <FieldLabel schema={schema} />
      <div className="nodrag mb-2 flex gap-2 text-xs">
        <button
          type="button"
          className={`px-2 py-1 rounded border ${mode === 1 ? 'bg-blue-50 border-blue-400 text-blue-700' : 'border-gray-300 text-gray-600'}`}
          onClick={() => {
            setMode(1);
            applyPreset(pct);
          }}
        >
          Preset width
        </button>
        <button
          type="button"
          className={`px-2 py-1 rounded border ${mode === 0 ? 'bg-blue-50 border-blue-400 text-blue-700' : 'border-gray-300 text-gray-600'}`}
          onClick={() => {
            setMode(0);
            applyExplicit(minPrice, maxPrice);
          }}
        >
          Explicit prices
        </button>
      </div>

      {mode === 1 ? (
        <select
          className="nodrag w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          value={String(pct)}
          onChange={(e) => {
            const next = Number(e.target.value);
            setPct(next);
            applyPreset(next);
          }}
        >
          {PRESET_WIDTHS.map((w) => (
            <option key={w} value={w}>
              ±{w}% around current price
            </option>
          ))}
        </select>
      ) : (
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="decimal"
            className={`nodrag w-1/2 border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 ${error ? 'border-red-400' : 'border-gray-300 focus:ring-blue-500'}`}
            value={minPrice}
            onChange={(e) => {
              setMinPrice(e.target.value);
              applyExplicit(e.target.value, maxPrice);
            }}
            placeholder="Min price"
          />
          <input
            type="text"
            inputMode="decimal"
            className={`nodrag w-1/2 border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 ${error ? 'border-red-400' : 'border-gray-300 focus:ring-blue-500'}`}
            value={maxPrice}
            onChange={(e) => {
              setMaxPrice(e.target.value);
              applyExplicit(minPrice, e.target.value);
            }}
            placeholder="Max price"
          />
        </div>
      )}
      <FieldError message={error} />
    </div>
  );
}

/** Percentage input (1–100), e.g. share of LP liquidity to remove. */
function PercentField({
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
  const error = useFieldError(nodeId, fieldName);
  const initial = value === undefined || value === null ? (schema.default as number) ?? 100 : Number(value);
  const [pct, setPct] = useState<string>(String(initial));
  return (
    <div>
      <FieldLabel schema={schema} />
      <div className="flex items-center gap-2">
        <input
          type="number"
          min="1"
          max="100"
          step="1"
          className={`nodrag w-24 border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 ${error ? 'border-red-400 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'}`}
          value={pct}
          onChange={(e) => {
            setPct(e.target.value);
            onChange(fieldName, e.target.value === '' ? undefined : Number(e.target.value));
          }}
        />
        <span className="text-sm text-gray-500">%</span>
      </div>
      <FieldError message={error} />
    </div>
  );
}

const FEE_TIERS: { value: number; label: string }[] = [
  { value: 100, label: '0.01%' },
  { value: 500, label: '0.05%' },
  { value: 2500, label: '0.25%' },
  { value: 10000, label: '1%' },
];

/** PancakeSwap V3 fee-tier selector. Emits the integer tier (100/500/…). */
function FeeTierField({
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
  const error = useFieldError(nodeId, fieldName);
  const current = value === undefined || value === null ? (schema.default as number) ?? 500 : Number(value);
  return (
    <div>
      <FieldLabel schema={schema} />
      <select
        className={`nodrag w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 ${
          error ? 'border-red-400 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'
        }`}
        value={String(current)}
        onChange={(e) => onChange(fieldName, Number(e.target.value))}
      >
        {FEE_TIERS.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
      <FieldError message={error} />
    </div>
  );
}

const RANGE_PERCENT_PRESETS = [3, 10, 20];

/**
 * Percentage range picker → emits a `tickDelta` (int24) half-width. The user picks
 * a ±% band (or types a custom %); centering is on-chain. Reverses the stored
 * tickDelta back to a % for display.
 */
function RangePercentField({
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
  const error = useFieldError(nodeId, fieldName);
  const current =
    value === undefined || value === null ? (schema.default as number) ?? 1000 : Number(value);
  const currentPct = tickDeltaToPct(current);
  const [custom, setCustom] = useState('');

  return (
    <div>
      <FieldLabel schema={schema} />
      <div className="flex gap-2 items-center">
        {RANGE_PERCENT_PRESETS.map((p) => (
          <button
            type="button"
            key={p}
            className={`nodrag px-2 py-1 text-sm rounded border ${
              Math.abs(currentPct - p) < 0.5
                ? 'bg-blue-500 text-white border-blue-500'
                : 'border-gray-300'
            }`}
            onClick={() => {
              setCustom('');
              onChange(fieldName, presetTickDelta(p));
            }}
          >
            ±{p}%
          </button>
        ))}
        <input
          className="nodrag w-24 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="±% …"
          value={custom}
          onChange={(e) => {
            setCustom(e.target.value);
            const pct = Number(e.target.value);
            if (Number.isFinite(pct) && pct > 0) onChange(fieldName, presetTickDelta(pct));
          }}
        />
      </div>
      <p className="text-xs text-gray-500 mt-1">
        ≈ ±{currentPct.toFixed(1)}% ({current} ticks)
      </p>
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
  tokens: { address: string; symbol: string; decimals?: number }[];
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
