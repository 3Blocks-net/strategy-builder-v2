import { AuditLog } from './audit-log.js';

/** Eine sensible/schreibende Aktion, die das Gate passieren muss. */
export interface GuardedAction {
  tool: string;
  /** Sensibel markiert ⇒ Confirm-Gate Pflicht. Nicht-sensible laufen bestätigungsfrei. */
  sensitive: boolean;
  /** Aus der kanonischen TX server-seitig dekodierte Klartext-Zusammenfassung. */
  summary: string;
  details: Record<string, unknown>;
}

export interface ConfirmationRequest {
  tool: string;
  summary: string;
  details: Record<string, unknown>;
}

/**
 * Bestätigungs-Frontend (MCP-Elicitation oder localhost-Seite). Liefert `true` =
 * freigegeben, `false` = abgelehnt; **wirft** bei Timeout/keiner Möglichkeit
 * (→ hartes Fail, kein Signieren). Die Freigabe ist ein server-interner Zustand;
 * das LLM kann sie nicht über Tool-Argumente fälschen.
 */
export interface ConfirmationProvider {
  requestApproval(req: ConfirmationRequest): Promise<boolean>;
}

export interface PolicyConfig {
  readOnly: boolean;
}

/** Vom Gate erzwungene Ablehnung (Read-only / abgelehnt / Timeout). */
export class PolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PolicyError';
  }
}

export interface GuardExecuteResult<T> {
  result: T;
  txHash?: string;
}

/**
 * Zentraler Signing-Chokepoint. Reine Entscheidungslogik (Read-only? Confirm nötig?)
 * + Audit. Die Freigabe kommt **ausschließlich** vom `ConfirmationProvider` — es gibt
 * keinen Pfad, über den das LLM via Tool-Args selbst bestätigen könnte. Das write-
 * Tool blockiert synchron auf `guard`, bis Freigabe oder hartes Fail.
 */
export class PolicyGate {
  constructor(
    private readonly config: PolicyConfig,
    private readonly confirmation: ConfirmationProvider,
    private readonly audit: AuditLog,
  ) {}

  async guard<T>(
    action: GuardedAction,
    execute: () => Promise<GuardExecuteResult<T>>,
  ): Promise<T> {
    const base = { tool: action.tool, params: action.details, summary: action.summary };

    if (this.config.readOnly) {
      await this.audit.record({ ...base, outcome: 'rejected', detail: 'read-only mode' });
      throw new PolicyError('Read-only-Modus aktiv: schreibende Aktionen sind deaktiviert.');
    }

    if (action.sensitive) {
      await this.audit.record({ ...base, outcome: 'requested' });
      let approved: boolean;
      try {
        approved = await this.confirmation.requestApproval({
          tool: action.tool,
          summary: action.summary,
          details: action.details,
        });
      } catch {
        // Timeout oder keine Bestätigungsmöglichkeit ⇒ hartes Fail, niemals signieren.
        await this.audit.record({ ...base, outcome: 'timeout', detail: 'no confirmation / timeout' });
        throw new PolicyError(
          'Keine Bestätigung erhalten (Timeout/keine Möglichkeit) — es wurde nicht signiert.',
        );
      }
      if (!approved) {
        await this.audit.record({ ...base, outcome: 'denied' });
        throw new PolicyError('Aktion abgelehnt — es wurde nicht signiert.');
      }
    }

    try {
      const { result, txHash } = await execute();
      await this.audit.record({ ...base, outcome: 'success', txHash });
      return result;
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'unknown error';
      await this.audit.record({ ...base, outcome: 'error', detail });
      throw err;
    }
  }
}
