import type { DecodedSummary } from './summary-decoder.js';

/** Eine Action im flachen Intent (vom Agenten deklariert). */
export interface IntentAction {
  token?: string;
  direction?: string | number;
  amount?: string;
}

/**
 * Flacher Intent (MVP): `execution` + `trigger` + geordnete Action-Liste. Deckt
 * lineare Ketten ab (~90 % der realen Strategien). Verzweigte Graphen entziehen
 * sich dem flachen Diff und werden nur markiert.
 */
export interface FlatIntent {
  execution: 'public' | 'owner';
  trigger?: { periodSeconds?: number };
  actions: IntentAction[];
}

export interface CrossCheckResult {
  ok: boolean;
  diffs: string[];
  warnings: string[];
}

/**
 * Intent-Cross-Check: vergleicht den vom Agenten deklarierten flachen Intent mit
 * dem **server-decodierten** Graphen (SummaryDecoder). Bei Abweichung → Reject mit
 * Diff. `execution` wird gegen die backend-abgeleitete Topologie (`ownerOnly`)
 * geprüft. Verzweigte Graphen werden als „nicht voll cross-checkbar" markiert
 * (kein Reject, aber Warnung). Fängt LLM-Selbst-Inkonsistenz — kein Diebstahl-
 * Schutz (Intent kommt vom selben LLM; Diebstahl ist über Allowlist/Confirm gelöst).
 */
export function crossCheckIntent(
  intent: FlatIntent,
  decoded: DecodedSummary,
  ownerOnly: boolean,
  opts: { triggerSeconds?: number; branched?: boolean } = {},
): CrossCheckResult {
  const diffs: string[] = [];
  const warnings: string[] = [];

  const derivedExecution = ownerOnly ? 'owner' : 'public';
  if (intent.execution !== derivedExecution) {
    diffs.push(
      `execution: Intent „${intent.execution}" ≠ abgeleitete Topologie „${derivedExecution}".`,
    );
  }

  const actions = decoded.steps.filter((s) => s.category === 'ACTION');
  if (actions.length !== intent.actions.length) {
    diffs.push(`Action-Anzahl: Intent ${intent.actions.length} ≠ Graph ${actions.length}.`);
  } else {
    actions.forEach((step, i) => {
      const want = intent.actions[i];
      if (
        want.token !== undefined &&
        step.token !== undefined &&
        want.token.toLowerCase() !== step.token.toLowerCase()
      ) {
        diffs.push(`Action ${i + 1} Token: Intent ${want.token} ≠ Graph ${step.token}.`);
      }
      if (want.amount !== undefined && step.amount !== undefined && want.amount !== step.amount) {
        diffs.push(`Action ${i + 1} Betrag: Intent ${want.amount} ≠ Graph ${step.amount}.`);
      }
      if (
        want.direction !== undefined &&
        step.direction !== undefined &&
        String(want.direction) !== String(step.direction)
      ) {
        diffs.push(`Action ${i + 1} Richtung: Intent ${want.direction} ≠ Graph ${step.direction}.`);
      }
    });
  }

  if (
    intent.trigger?.periodSeconds !== undefined &&
    opts.triggerSeconds !== undefined &&
    intent.trigger.periodSeconds !== opts.triggerSeconds
  ) {
    diffs.push(
      `Trigger-Periode: Intent ${intent.trigger.periodSeconds}s ≠ Graph ${opts.triggerSeconds}s.`,
    );
  }

  if (opts.branched) {
    warnings.push(
      'Verzweigter Graph — nicht voll cross-checkbar; im Confirm-Gate besonders prüfen.',
    );
  }
  warnings.push(...decoded.warnings);

  return { ok: diffs.length === 0, diffs, warnings };
}
