import { toBaseUnits } from 'shared';

/** Decimals eines kuratierten Tokens; wirft hart bei unbekanntem Token. */
export function decimalsOf(tokenDecimals: Record<string, number>, token: string): number {
  const d = tokenDecimals[token.toLowerCase()];
  if (d === undefined) {
    throw new Error(
      `Nicht-kuratierter Token ${token} (unbekannte Decimals) — bitte einen akzeptierten Token wählen.`,
    );
  }
  return d;
}

/**
 * Max-Betrag-Prüfung in **Base-Units (BigInt)** — kein Float-Vergleich, damit
 * hochdezimale/große Beträge das Limit nicht durch IEEE-754-Rundung umgehen.
 */
export function checkMax(
  maxPerToken: Map<string, string>,
  token: string,
  amount: string,
  decimals: number,
): void {
  const max = maxPerToken.get(token.toLowerCase());
  if (max === undefined) return;
  if (BigInt(toBaseUnits(amount, decimals)) > BigInt(toBaseUnits(max, decimals))) {
    throw new Error(
      `Betrag ${amount} übersteigt das konfigurierte Max-Limit ${max} für diesen Token — abgelehnt (separate Freigabe nötig).`,
    );
  }
}
