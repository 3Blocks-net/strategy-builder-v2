import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useSendTransaction } from 'wagmi';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';

interface AutomationListItem {
  id: string;
  label: string | null;
  stepCount: number;
  isDraft: boolean;
  ownerOnly: boolean;
  onChainId: number | null;
  active: boolean | null;
  triggerStatus: {
    type: string;
    met: boolean;
    description: string;
    nextFireAt?: string;
  } | null;
}

interface AutomationListProps {
  vaultAddress: string;
}

export function AutomationList({ vaultAddress }: AutomationListProps) {
  const navigate = useNavigate();
  const [automations, setAutomations] = useState<AutomationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingToggle, setPendingToggle] = useState<string | null>(null);
  const [pendingExecute, setPendingExecute] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const { sendTransactionAsync } = useSendTransaction();

  const fetchAutomations = () => {
    apiFetch(`/vaults/${vaultAddress}/automations`)
      .then((r) => r.json())
      .then((data) => {
        setAutomations(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchAutomations();
    const interval = setInterval(fetchAutomations, 30_000);
    return () => clearInterval(interval);
  }, [vaultAddress]);

  const handleToggle = async (a: AutomationListItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (a.isDraft || a.onChainId === null) return;

    const targetActive = !a.active;
    setPendingToggle(a.id);

    setAutomations((prev) =>
      prev.map((x) => (x.id === a.id ? { ...x, active: targetActive } : x)),
    );

    try {
      const res = await apiFetch(
        `/vaults/${vaultAddress}/automations/${a.id}/encode-toggle`,
        { method: 'POST', body: JSON.stringify({ active: targetActive }) },
      );
      const { calldata } = await res.json();

      await sendTransactionAsync({
        to: vaultAddress as `0x${string}`,
        data: calldata as `0x${string}`,
        gas: 200_000n,
      });

      setTimeout(fetchAutomations, 3000);
    } catch {
      setAutomations((prev) =>
        prev.map((x) => (x.id === a.id ? { ...x, active: a.active } : x)),
      );
    } finally {
      setPendingToggle(null);
    }
  };

  const handleExecute = async (a: AutomationListItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (a.isDraft || a.onChainId === null) return;

    setPendingExecute(a.id);
    try {
      const res = await apiFetch(
        `/vaults/${vaultAddress}/automations/${a.id}/encode-execute`,
        { method: 'POST' },
      );
      const { calldata } = await res.json();

      await sendTransactionAsync({
        to: vaultAddress as `0x${string}`,
        data: calldata as `0x${string}`,
        // executeAutomation walks the whole step graph via delegatecall; fork gas
        // estimation is unreliable for proxy delegatecalls (see CLAUDE.md), so use
        // a generous explicit override.
        gas: 2_000_000n,
      });

      setTimeout(fetchAutomations, 3000);
    } catch {
      // swallow — user-rejected or failed tx leaves the list unchanged
    } finally {
      setPendingExecute(null);
    }
  };

  const handleDelete = async (a: AutomationListItem) => {
    try {
      const res = await apiFetch(
        `/vaults/${vaultAddress}/automations/${a.id}`,
        { method: 'DELETE' },
      );
      if (res.ok) {
        setAutomations((prev) => prev.filter((x) => x.id !== a.id));
      } else {
        const body = await res.json().catch(() => ({}));
        alert(body.message ?? 'Delete failed');
      }
    } finally {
      setConfirmDelete(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Automations</h2>
        <Button
          size="sm"
          onClick={() => navigate(`/vault/${vaultAddress}/automation/new/edit`)}
        >
          Create Automation
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading automations...</p>
      ) : automations.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p className="text-sm">No automations yet.</p>
          <p className="text-xs mt-1">Create your first automation to get started.</p>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Steps</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Trigger</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {automations.map((a) => (
                <tr
                  key={a.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/vault/${vaultAddress}/automation/${a.id}/edit`)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">
                        {a.label || 'Untitled'}
                      </span>
                      {a.isDraft && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">Draft</span>
                      )}
                      {a.ownerOnly && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Owner-only</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{a.stepCount}</td>
                  <td className="px-4 py-3">
                    {a.isDraft ? (
                      <span className="text-xs text-gray-400">&mdash;</span>
                    ) : a.ownerOnly ? (
                      <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">Manual</span>
                    ) : a.active ? (
                      <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">Active</span>
                    ) : (
                      <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">Inactive</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {a.isDraft || a.ownerOnly ? (
                      <span className="text-xs text-gray-400">&mdash;</span>
                    ) : a.triggerStatus ? (
                      <span className={a.triggerStatus.met ? 'text-green-600 font-medium' : ''}>
                        {a.triggerStatus.description}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2">
                      {!a.isDraft && a.ownerOnly && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pendingExecute === a.id}
                          onClick={(e) => handleExecute(a, e)}
                        >
                          {pendingExecute === a.id ? '...' : 'Execute'}
                        </Button>
                      )}
                      {!a.isDraft && !a.ownerOnly && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pendingToggle === a.id}
                          onClick={(e) => handleToggle(a, e)}
                        >
                          {pendingToggle === a.id
                            ? '...'
                            : a.active
                              ? 'Deactivate'
                              : 'Activate'}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        disabled={!a.ownerOnly && a.active === true}
                        title={
                          !a.ownerOnly && a.active
                            ? 'Deactivate before deleting'
                            : 'Delete automation'
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDelete(a.id);
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full mx-4 p-6">
            <h3 className="text-lg font-semibold mb-2">Delete Automation</h3>
            <p className="text-sm text-gray-600 mb-4">
              This will remove the automation from your list. The on-chain automation data will remain until overwritten. Continue?
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={() => {
                  const a = automations.find((x) => x.id === confirmDelete);
                  if (a) handleDelete(a);
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
