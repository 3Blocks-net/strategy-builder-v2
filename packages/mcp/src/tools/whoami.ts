import type { OwnerSession } from '../session.js';

export interface WhoamiResult {
  address: `0x${string}`;
}

/** Liefert die verbundene Owner-Adresse. Rein und ohne Seiteneffekte. */
export function whoami(session: OwnerSession): WhoamiResult {
  return { address: session.address };
}
