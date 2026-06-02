import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';

interface SlotEntry {
  name: string;
  type: string;
  description: string;
  createdByAutomationId: string;
  currentOnChainValue: string;
}

interface ContextSlotsResponse {
  slots: Record<string, SlotEntry>;
  contextLength: number;
  dbSlotCount: number;
  syncWarning: boolean;
}

interface ContextViewProps {
  vaultAddress: string;
}

/**
 * Decode a raw context slot value (a `bytes` blob from getContext()) into a
 * human-readable string based on the slot's declared type. Falls back to the
 * raw hex when the value can't be interpreted.
 */
function decodeValue(hex: string, type: string): string {
  if (!hex || hex === '0x') return '∅ empty';
  try {
    if (type === 'address') return '0x' + hex.slice(-40);
    if (type === 'bool') return BigInt(hex) === 0n ? 'false' : 'true';
    if (type.startsWith('uint') || type.startsWith('int')) {
      return BigInt(hex).toString();
    }
  } catch {
    // fall through to raw hex
  }
  return hex;
}

function truncateHex(hex: string): string {
  if (!hex || hex.length <= 20) return hex;
  return `${hex.slice(0, 10)}…${hex.slice(-8)}`;
}

export function ContextView({ vaultAddress }: ContextViewProps) {
  const [data, setData] = useState<ContextSlotsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchContext = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/vaults/${vaultAddress}/context-slots`);
      if (!res.ok) throw new Error('Failed to load context');
      setData(await res.json());
    } catch {
      setError('Failed to load context');
    } finally {
      setLoading(false);
    }
  }, [vaultAddress]);

  useEffect(() => {
    fetchContext();
  }, [fetchContext]);

  const slots = data
    ? Object.entries(data.slots).sort(
        ([a], [b]) => parseInt(a, 10) - parseInt(b, 10),
      )
    : [];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Context</h2>
        <Button
          variant="ghost"
          size="sm"
          disabled={loading}
          onClick={fetchContext}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      {data?.syncWarning && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Out of sync: the on-chain context has {data.contextLength} slot
          {data.contextLength === 1 ? '' : 's'}, but {data.dbSlotCount}{' '}
          {data.dbSlotCount === 1 ? 'is' : 'are'} defined in the editor.
        </div>
      )}

      {loading && !data ? (
        <p className="text-sm text-gray-500">Loading context…</p>
      ) : error ? (
        <div className="rounded-md border border-destructive/50 p-6 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={fetchContext}
          >
            Retry
          </Button>
        </div>
      ) : slots.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-gray-500">
          <p className="text-sm">This vault has no context slots.</p>
          <p className="mt-1 text-xs">
            Context slots are defined by automations that read or write shared
            variables.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-gray-200">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-gray-600">Slot</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">Name</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">Type</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">On-chain value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {slots.map(([index, slot]) => (
                <tr key={index} className="align-top">
                  <td className="px-4 py-3 font-mono text-gray-500">{index}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">
                      {slot.name || <span className="text-gray-400">unnamed</span>}
                    </div>
                    {slot.description && (
                      <div className="mt-0.5 text-xs text-gray-400">
                        {slot.description}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{slot.type}</td>
                  <td className="px-4 py-3">
                    <div className="font-mono text-gray-900">
                      {decodeValue(slot.currentOnChainValue, slot.type)}
                    </div>
                    {slot.currentOnChainValue &&
                      slot.currentOnChainValue !== '0x' && (
                        <div
                          className="mt-0.5 font-mono text-xs text-gray-400"
                          title={slot.currentOnChainValue}
                        >
                          {truncateHex(slot.currentOnChainValue)}
                        </div>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
