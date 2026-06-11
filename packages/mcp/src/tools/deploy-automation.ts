import { resolveFieldRole, type RawGraph } from 'shared';
import { PolicyGate } from '../policy-gate.js';
import { DraftStore, type Draft } from '../draft-store.js';
import type { DecoderCatalog } from '../summary-decoder.js';

export interface DeployConfig {
  ownerAddress: string;
  /** lowercased erlaubte Geld-Ziele (Owner sollte enthalten sein). */
  addressAllowlist: Set<string>;
  /** Namen freigeschalteter sensibler Step-Types (Capability-Opt-in). */
  enabledSensitiveSteps: Set<string>;
}

/** Signiert + sendet die Deploy-TX(s) und liefert On-Chain-ID + TX-Hashes. */
export type DeployOnChain = (
  draft: Draft,
) => Promise<{ onChainId: number; txHashes: string[] }>;

export interface DeployDeps {
  gate: PolicyGate;
  draftStore: DraftStore;
  catalog: DecoderCatalog;
  config: DeployConfig;
  deployOnChain: DeployOnChain;
}

export interface DeployResult {
  onChainId: number;
  txHashes: string[];
  automationId: string;
}

interface Inspection {
  sensitive: boolean;
  errors: string[];
}

/**
 * Schema-getriebene Prüfung des gespeicherten Graphen:
 * - Empfänger-Rollen-Felder (Geld-Ziele) müssen in der Adress-Allowlist sein.
 * - Steps mit Empfänger-Rolle sind **sensibel** → Capability-Opt-in Pflicht und
 *   lösen das Confirm-Gate aus. (Kein per-step-type-Code.)
 */
function inspectGraph(rawGraph: RawGraph, catalog: DecoderCatalog, config: DeployConfig): Inspection {
  const errors: string[] = [];
  let sensitive = false;

  for (const node of rawGraph.nodes) {
    const step = catalog[node.data.stepTypeId];
    if (!step) continue;
    const props = step.paramSchema?.properties ?? {};
    let nodeSensitive = false;

    for (const [field, schema] of Object.entries(props)) {
      if (resolveFieldRole(schema) === 'recipient') {
        nodeSensitive = true;
        const recipient = String(node.data.params[field] ?? '');
        if (recipient && !config.addressAllowlist.has(recipient.toLowerCase())) {
          errors.push(
            `${step.name}: Empfänger ${recipient} ist nicht in der Adress-Allowlist — abgelehnt.`,
          );
        }
      }
    }

    if (nodeSensitive) {
      sensitive = true;
      if (!config.enabledSensitiveSteps.has(step.name)) {
        errors.push(
          `${step.name}: sensibler Step nicht freigeschaltet (Capability-Opt-in fehlt) — nicht verbaubar.`,
        );
      }
    }
  }

  return { sensitive, errors };
}

function isBranched(rawGraph: RawGraph): boolean {
  return rawGraph.nodes.some((node) => {
    const handles = new Set(
      rawGraph.edges.filter((e) => e.source === node.id).map((e) => e.sourceHandle),
    );
    return handles.has('true') && handles.has('false');
  });
}

/** Confirm-Summary aus dem GESPEICHERTEN Entwurf (nicht aus LLM-Args). */
function formatSummary(draft: Draft, branched: boolean): string {
  const lines = [
    `Automation deployen (${draft.ownerOnly ? 'Owner-only' : 'Public — feuert autonom'}):`,
  ];
  for (const step of draft.summary.steps) {
    const parts = [step.stepType];
    if (step.amount) parts.push(`Betrag ${step.amount}`);
    if (step.token) parts.push(`Token ${step.token}`);
    if (step.recipient) parts.push(`→ ${step.recipient}`);
    if (step.direction !== undefined) parts.push(`Richtung ${step.direction}`);
    lines.push('  • ' + parts.join(', '));
  }
  if (branched) {
    lines.push('  ⚠ Verzweigter Graph — NICHT voll cross-checkbar, bitte besonders prüfen.');
  }
  for (const w of draft.summary.warnings) lines.push('  ⚠ ' + w);
  return lines.join('\n');
}

/**
 * Deployt einen validierten Entwurf. Nimmt **nur die Draft-ID** und signiert
 * exakt den gespeicherten Graphen. Schema-getriebene Allowlist-/Capability-Checks,
 * Confirm-Gate bei Sensibilität (Summary aus dem gespeicherten Entwurf), dann
 * Sign+Send. Reverts werden vom Chain-Executor dekodiert.
 */
export async function deployAutomation(
  deps: DeployDeps,
  params: { draftId: string },
): Promise<DeployResult> {
  const draft = deps.draftStore.get(params.draftId);
  if (!draft) {
    throw new Error(
      'Draft-ID unbekannt oder abgelaufen — bitte propose_automation erneut ausführen.',
    );
  }

  const { sensitive, errors } = inspectGraph(draft.rawGraph, deps.catalog, deps.config);
  if (errors.length > 0) {
    throw new Error(`Deploy abgelehnt:\n- ${errors.join('\n- ')}`);
  }

  const summary = formatSummary(draft, isBranched(draft.rawGraph));

  return deps.gate.guard(
    {
      tool: 'deploy_automation',
      sensitive,
      summary,
      details: {
        draftId: params.draftId,
        vault: draft.vaultAddress,
        execution: draft.ownerOnly ? 'owner' : 'public',
      },
    },
    async () => {
      const { onChainId, txHashes } = await deps.deployOnChain(draft);
      return {
        result: { onChainId, txHashes, automationId: draft.automationId },
        txHash: txHashes.at(-1),
      };
    },
  );
}
