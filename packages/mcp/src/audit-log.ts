import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export type AuditOutcome =
  | 'requested'
  | 'approved'
  | 'denied'
  | 'timeout'
  | 'rejected'
  | 'success'
  | 'error';

export interface AuditEntry {
  timestamp: string;
  tool: string;
  params: Record<string, unknown>;
  summary?: string;
  txHash?: string;
  outcome: AuditOutcome;
  detail?: string;
}

export interface AuditLogDeps {
  /** Append one line (with trailing newline added here). Injectable for tests. */
  append: (line: string) => Promise<void>;
  /** ISO clock — injectable for deterministic tests. */
  clock?: () => string;
}

/**
 * Append-only lokales Audit-Log (Zeitpunkt, Tool, Parameter, TX-Hash, Ergebnis).
 * Self-custody-konsistent: eine lokale Datei auf dem Rechner des Nutzers. Schreibt
 * nur, was ihm übergeben wird — Aufrufer reichen niemals Key-Material hinein.
 */
export class AuditLog {
  readonly #append: (line: string) => Promise<void>;
  readonly #clock: () => string;

  constructor(deps: AuditLogDeps) {
    this.#append = deps.append;
    this.#clock = deps.clock ?? (() => new Date().toISOString());
  }

  async record(entry: Omit<AuditEntry, 'timestamp'>): Promise<void> {
    const full: AuditEntry = { timestamp: this.#clock(), ...entry };
    await this.#append(JSON.stringify(full));
  }
}

/** Datei-gestütztes Audit-Log (append-only). */
export function fileAuditLog(path: string): AuditLog {
  return new AuditLog({
    append: async (line) => {
      await mkdir(dirname(path), { recursive: true });
      await appendFile(path, line + '\n', { encoding: 'utf8' });
    },
  });
}
