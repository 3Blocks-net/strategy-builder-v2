import { randomBytes } from 'node:crypto';
import type { RawGraph } from 'shared';
import type { DecodedSummary } from './summary-decoder.js';

/** Server-intern gehaltener, validierter Automation-Entwurf (kein Backend-State). */
export interface Draft {
  vaultAddress: string;
  automationId: string;
  rawGraph: RawGraph;
  contextOverrides: Record<string, string>;
  ownerOnly: boolean;
  summary: DecodedSummary;
}

export interface DraftStoreOptions {
  ttlMs?: number;
  clock?: () => number;
  genId?: () => string;
}

/**
 * In-memory Draft-Store (pro Session, mit TTL). `propose` legt den validierten
 * Graphen ab und gibt nur eine **Draft-ID** zurück; `deploy` (Slice 9) liest exakt
 * den gespeicherten Graphen. Es gibt bewusst **keinen Update-Pfad** — das LLM kann
 * den abgelegten Entwurf zwischen propose und deploy nicht verändern.
 */
export class DraftStore {
  readonly #map = new Map<string, { draft: Draft; expiresAt: number }>();
  readonly #ttlMs: number;
  readonly #clock: () => number;
  readonly #genId: () => string;

  constructor(opts: DraftStoreOptions = {}) {
    this.#ttlMs = opts.ttlMs ?? 600_000; // 10 min
    this.#clock = opts.clock ?? (() => Date.now());
    this.#genId = opts.genId ?? (() => randomBytes(12).toString('hex'));
  }

  create(draft: Draft): string {
    const id = this.#genId();
    this.#map.set(id, { draft, expiresAt: this.#clock() + this.#ttlMs });
    return id;
  }

  get(id: string): Draft | undefined {
    const entry = this.#map.get(id);
    if (!entry) return undefined;
    if (this.#clock() > entry.expiresAt) {
      this.#map.delete(id);
      return undefined;
    }
    return entry.draft;
  }
}
