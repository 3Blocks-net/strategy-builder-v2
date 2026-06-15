import type { Execution } from '@prisma/client';

/**
 * Emit seam between the indexer (success producer) and the real-time layer.
 *
 * Slice #01 ships a no-op default; the WebSocket gateway (slice #06) overrides
 * this provider to push new SUCCESS rows to the owner's `vault:<address>` room.
 * Keeping it an injected port means the indexer never imports the gateway and
 * the two slices stay decoupled.
 */
export const EXECUTION_EVENTS_PORT = Symbol('EXECUTION_EVENTS_PORT');

export interface ExecutionEventsPort {
  /** Called by the indexer after persisting newly-seen SUCCESS rows. */
  emitNewExecutions(vaultAddress: string, executions: Execution[]): void;
}

/** Default no-op implementation (replaced in slice #06). */
export class NoopExecutionEvents implements ExecutionEventsPort {
  emitNewExecutions(): void {
    /* no-op until the WS gateway is wired */
  }
}
