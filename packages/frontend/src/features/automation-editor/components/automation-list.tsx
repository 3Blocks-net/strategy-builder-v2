import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
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
                        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                          Draft
                        </span>
                      )}
                      {a.ownerOnly && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                          Owner-only
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{a.stepCount}</td>
                  <td className="px-4 py-3">
                    {a.isDraft ? (
                      <span className="text-xs text-gray-400">—</span>
                    ) : a.active === true ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                        Active
                      </span>
                    ) : a.active === false ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                        Inactive
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {a.isDraft ? (
                      <span className="text-xs text-gray-400">—</span>
                    ) : a.triggerStatus ? (
                      <span
                        className={
                          a.triggerStatus.met
                            ? 'text-green-600 font-medium'
                            : 'text-gray-600'
                        }
                      >
                        {a.triggerStatus.description}
                      </span>
                    ) : null}
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
