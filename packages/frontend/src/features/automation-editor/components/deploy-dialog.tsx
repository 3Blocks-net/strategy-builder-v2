import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useSendTransaction } from 'wagmi';
import { decodeEventLog } from 'viem';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';
import { StrategyBuilderVaultAbi } from '@/lib/abis';
import { waitForReceipt } from '@/lib/wait-for-receipt';
import { useEditorStore } from '../store/editor-store';
import { mapGraphToRaw, buildContextOverrides } from '../lib/encode-boundary';

interface ContextChange {
  slotIndex: number;
  slotName: string;
  isNew: boolean;
  currentValue?: string;
  newValue: string;
  usedByActiveAutomations: string[];
}

interface EncodeResponse {
  automationCalldata: string;
  contextCalldata?: string;
  functionName: string;
  ownerOnly: boolean;
  stepCount: number;
  requiresContextTx: boolean;
  contextChanges: ContextChange[];
}

interface DeployDialogProps {
  automationId: string;
  label: string;
  isEdit?: boolean;
  onClose: () => void;
}

type DeployPhase = 'preview' | 'encoding' | 'context-tx' | 'context-wait' | 'auto-tx' | 'auto-wait' | 'backend-confirm' | 'done' | 'error';

export function DeployDialog({ automationId, label, isEdit = false, onClose }: DeployDialogProps) {
  const { address: vaultAddress } = useParams<{ address: string }>();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<DeployPhase>('preview');
  const [encodeResult, setEncodeResult] = useState<EncodeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nodes = useEditorStore((s) => s.nodes);
  const edges = useEditorStore((s) => s.edges);
  const stepSchemas = useEditorStore((s) => s.stepSchemas);
  const tokenDecimals = useEditorStore((s) => s.tokenDecimals);

  const { sendTransactionAsync } = useSendTransaction();

  const handleDeploy = async () => {
    if (!vaultAddress) return;

    try {
      setPhase('encoding');
      setError(null);
      // Encode-boundary mapper: convert the friendly editor params to raw
      // values (and strip friendly-only fields) right before POST /encode, and
      // derive the name-keyed contextOverrides (e.g. start-time → time slot).
      const graph = mapGraphToRaw(nodes, edges, stepSchemas, tokenDecimals);
      const builtOverrides = buildContextOverrides(nodes, stepSchemas);
      const overrides = Object.keys(builtOverrides).length > 0 ? builtOverrides : undefined;

      const encodePath = isEdit ? 'encode-update' : 'encode';
      const res = await apiFetch(
        `/vaults/${vaultAddress}/automations/${automationId}/${encodePath}`,
        { method: 'POST', body: JSON.stringify({ contextOverrides: overrides, graph }) },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? 'Encoding failed');
      }
      const data: EncodeResponse = await res.json();
      setEncodeResult(data);

      if (data.requiresContextTx && data.contextCalldata) {
        setPhase('context-tx');
        const ctxHash = await sendTransactionAsync({
          to: vaultAddress as `0x${string}`,
          data: data.contextCalldata as `0x${string}`,
          gas: 500_000n,
        });
        setPhase('context-wait');
        await waitForReceipt(ctxHash);
      }

      setPhase('auto-tx');
      const autoHash = await sendTransactionAsync({
        to: vaultAddress as `0x${string}`,
        data: data.automationCalldata as `0x${string}`,
        gas: 2_000_000n,
      });
      setPhase('auto-wait');
      const receipt = await waitForReceipt(autoHash);
      if (!receipt) {
        throw new Error('Timed out waiting for the deployment transaction');
      }

      let onChainId: number | null = null;
      for (const log of receipt.logs) {
        try {
          const event = decodeEventLog({
            abi: StrategyBuilderVaultAbi,
            data: log.data,
            topics: log.topics,
          });
          if (event.eventName === 'AutomationCreated') {
            onChainId = Number((event.args as any).automationId);
            break;
          }
        } catch {
          // not our event
        }
      }

      if (onChainId === null) {
        throw new Error(
          'Could not read the on-chain automation ID from the transaction',
        );
      }

      setPhase('backend-confirm');
      await apiFetch(`/vaults/${vaultAddress}/automations/${automationId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          onChainId,
          txHash: autoHash,
          ownerOnly: data.ownerOnly,
          stepCount: data.stepCount,
        }),
      });

      setPhase('done');
    } catch (err: any) {
      setError(err?.shortMessage ?? err?.message ?? 'Deployment failed');
      setPhase('error');
    }
  };

  const txCount = encodeResult?.requiresContextTx ? 2 : 1;
  const isWorking = !['preview', 'done', 'error'].includes(phase);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold">Deploy Automation</h2>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-1">Summary</h3>
            <div className="bg-gray-50 rounded p-3 text-sm space-y-1">
              <div><span className="text-gray-500">Label:</span> {label || 'Untitled'}</div>
              {encodeResult && (
                <>
                  <div><span className="text-gray-500">Steps:</span> {encodeResult.stepCount}</div>
                  <div>
                    <span className="text-gray-500">Type:</span>{' '}
                    <span className={encodeResult.ownerOnly ? 'text-amber-600' : 'text-blue-600'}>
                      {encodeResult.ownerOnly ? 'Owner-only' : 'Public'}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {encodeResult && encodeResult.contextChanges.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-1">Context Slots</h3>
              <div className="space-y-2">
                {encodeResult.contextChanges.map((c) => (
                  <div key={c.slotIndex} className="bg-gray-50 rounded p-3 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{c.slotName}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${c.isNew ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                        {c.isNew ? 'New' : `Slot ${c.slotIndex}`}
                      </span>
                      {c.usedByActiveAutomations.length > 0 && (
                        <span className="text-xs text-amber-600 font-medium">⚠ Shared</span>
                      )}
                    </div>
                    {c.isNew && (
                      <p className="mt-1 text-xs text-gray-500 font-mono break-all">
                        Initial value: {c.newValue}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {(encodeResult || isWorking) && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-1">
                {encodeResult ? `Requires ${txCount} transaction(s)` : 'Preparing...'}
              </h3>
              <div className="space-y-1.5">
                {encodeResult?.requiresContextTx && (
                  <TxStep
                    label="Set Context"
                    active={phase === 'context-tx' || phase === 'context-wait'}
                    done={['auto-tx', 'auto-wait', 'backend-confirm', 'done'].includes(phase)}
                    confirming={phase === 'context-wait'}
                  />
                )}
                <TxStep
                  label={encodeResult?.ownerOnly ? 'Create Owner Automation' : 'Create Automation'}
                  active={phase === 'auto-tx' || phase === 'auto-wait'}
                  done={['backend-confirm', 'done'].includes(phase)}
                  confirming={phase === 'auto-wait'}
                />
              </div>
            </div>
          )}

          {error && <div className="bg-red-50 text-red-700 rounded p-3 text-sm">{error}</div>}
          {phase === 'done' && (
            <div className="bg-green-50 text-green-700 rounded p-3 text-sm font-medium">
              Automation deployed successfully!
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          {phase === 'done' ? (
            <Button onClick={() => navigate(`/vault/${vaultAddress}`)}>Back to Vault</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose} disabled={isWorking}>Cancel</Button>
              <Button onClick={handleDeploy} disabled={isWorking}>
                {isWorking ? 'Deploying...' : 'Confirm & Deploy'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TxStep({ label, active, done, confirming }: { label: string; active: boolean; done: boolean; confirming: boolean }) {
  let badge = 'Waiting';
  let cls = 'bg-gray-100 text-gray-500';
  if (active && !confirming) { badge = 'Submitting...'; cls = 'bg-blue-100 text-blue-700 animate-pulse'; }
  if (confirming) { badge = 'Confirming...'; cls = 'bg-amber-100 text-amber-700 animate-pulse'; }
  if (done) { badge = 'Done'; cls = 'bg-green-100 text-green-700'; }

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={`text-xs px-2 py-0.5 rounded ${cls}`}>{badge}</span>
      <span>{label}</span>
    </div>
  );
}
