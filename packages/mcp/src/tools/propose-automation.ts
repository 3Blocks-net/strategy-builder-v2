import { mapGraphToRaw, buildContextOverrides, type RawGraph } from 'shared';
import { BackendClient } from '../backend-client.js';
import { DraftStore } from '../draft-store.js';
import { decodeRawGraph, type DecoderCatalog } from '../summary-decoder.js';
import { crossCheckIntent, type FlatIntent } from '../intent-check.js';
import { isBranched } from '../graph-utils.js';

interface FriendlyNode {
  id: string;
  type?: string;
  data: { stepTypeId: string; params: Record<string, unknown> };
}
interface FriendlyEdge {
  source: string;
  target: string;
  sourceHandle?: string | null;
}

export interface ProposeParams {
  vaultAddress: string;
  graph: { nodes: FriendlyNode[]; edges: FriendlyEdge[] };
  intent: FlatIntent;
}

/** `factory.getPool(tokenA, tokenB, fee)` → Pool-Adresse (Zero = existiert nicht). */
export type GetPool = (tokenA: string, tokenB: string, fee: number) => Promise<string>;

export interface ProposeDeps {
  backend: BackendClient;
  draftStore: DraftStore;
  /** stepTypeId → { name, paramSchema, abiFragment } (aus /step-types). */
  catalog: DecoderCatalog;
  /** lowercased Token-Adresse → Decimals (aus /tokens). */
  tokenDecimals: Record<string, number>;
  getPool?: GetPool;
}

export interface ProposeResult {
  draftId: string;
  ownerOnly: boolean;
  summary: ReturnType<typeof decodeRawGraph>;
  warnings: string[];
}

const ZERO = '0x0000000000000000000000000000000000000000';

/** Trigger-Periode (Sekunden) aus dem ersten duration-Feld einer Condition. */
function extractTriggerSeconds(rawGraph: RawGraph, catalog: DecoderCatalog): number | undefined {
  for (const node of rawGraph.nodes) {
    if (node.type !== 'CONDITION') continue;
    const props = catalog[node.data.stepTypeId]?.paramSchema?.properties ?? {};
    for (const [field, schema] of Object.entries(props)) {
      if (schema['x-ui-widget'] === 'duration') {
        const v = node.data.params[field];
        if (v !== undefined) return Number(v);
      }
    }
  }
  return undefined;
}

/**
 * Baut aus dem Agent-Graphen einen validierten Entwurf — **ohne zu signieren**.
 * friendly → raw (shared-Mapper; nicht-kuratierter Token bricht hart ab) →
 * bestehendes `/encode` (raw-mode-Validierung; 400 ⇒ Reject mit Erklärung) →
 * Pool-Existenz-Check → Intent-Cross-Check (Reject bei Abweichung) → server-
 * interner Draft-Store. Gibt eine Draft-ID + die decodierte Summary zurück.
 */
export async function proposeAutomation(
  deps: ProposeDeps,
  params: ProposeParams,
): Promise<ProposeResult> {
  const { graph, intent, vaultAddress } = params;

  // 1. Nur Katalog-Bausteine (keine erfundenen Step-Types/Selektoren).
  for (const node of graph.nodes) {
    if (!deps.catalog[node.data.stepTypeId]) {
      throw new Error(
        `Unbekannter Step-Type „${node.data.stepTypeId}" — es sind nur Katalog-Bausteine erlaubt.`,
      );
    }
  }

  // 2. friendly → raw über den shared-Mapper. Wirft hart, wenn die Decimals eines
  //    Tokens unbekannt sind ⇒ Token-Allowlist-Durchsetzung vor jeder TX.
  let rawGraph: RawGraph;
  let contextOverrides: Record<string, string>;
  try {
    rawGraph = mapGraphToRaw(graph.nodes, graph.edges, deps.catalog, deps.tokenDecimals);
    contextOverrides = buildContextOverrides(graph.nodes, deps.catalog);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Graph nicht baubar (z. B. nicht-kuratierter Token): ${detail}`);
  }

  // 3. Pool-Existenz-Check für Swap-Nodes (vor Encode/TX).
  if (deps.getPool) {
    for (const node of graph.nodes) {
      const props = deps.catalog[node.data.stepTypeId]?.paramSchema?.properties ?? {};
      const hasSwapShape = 'tokenIn' in props && 'tokenOut' in props && 'fee' in props;
      if (!hasSwapShape) continue;
      const p = node.data.params;
      const pool = await deps.getPool(String(p.tokenIn), String(p.tokenOut), Number(p.fee));
      if (pool.toLowerCase() === ZERO) {
        throw new Error(
          `Kein PancakeSwap-Pool für ${String(p.tokenIn)}/${String(p.tokenOut)} (Fee ${String(p.fee)}) — Strategie nicht deploybar.`,
        );
      }
    }
  }

  // 4. Draft-Automation anlegen + über das bestehende /encode validieren.
  const draftAuto = await deps.backend.post<{ id: string }>(
    `/vaults/${vaultAddress}/automations`,
    { label: 'MCP-Entwurf' },
  );
  let ownerOnly: boolean;
  try {
    const encodeResult = await deps.backend.post<{ ownerOnly: boolean }>(
      `/vaults/${vaultAddress}/automations/${draftAuto.id}/encode`,
      { graph: rawGraph, contextOverrides },
    );
    ownerOnly = Boolean(encodeResult.ownerOnly);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Graph von der Encode-Boundary abgelehnt (kein Deploy): ${detail}`);
  }

  // 5. Decode + Intent-Cross-Check.
  const summary = decodeRawGraph(
    rawGraph,
    deps.catalog,
    deps.tokenDecimals,
    ownerOnly ? 'owner' : 'public',
  );
  const check = crossCheckIntent(intent, summary, ownerOnly, {
    triggerSeconds: extractTriggerSeconds(rawGraph, deps.catalog),
    branched: isBranched(rawGraph),
  });
  if (!check.ok) {
    throw new Error(
      `Intent ≠ Graph — abgelehnt (kein Deploy):\n- ${check.diffs.join('\n- ')}`,
    );
  }

  // 6. Server-intern ablegen, nur die Draft-ID + Summary zurückgeben.
  const draftId = deps.draftStore.create({
    vaultAddress,
    automationId: draftAuto.id,
    rawGraph,
    contextOverrides,
    ownerOnly,
    summary,
    catalog: deps.catalog,
  });

  return { draftId, ownerOnly, summary, warnings: check.warnings };
}
