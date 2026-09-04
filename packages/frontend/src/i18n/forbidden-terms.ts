/**
 * The invented German translations of finance and DeFi terms.
 *
 * `CLAUDE.md`, "Konventionen / Finanzbegriffe", lists the terms that stay
 * English in every language and, next to them, the home-made German words that
 * must never appear. Translating a whole surface is exactly the situation in
 * which one of them slips through — someone gets into the flow and turns
 * "Performance Fee" into "Erfolgsbeteiligung". This module makes that a test
 * failure instead of a review finding (`__tests__/forbidden-terms.test.ts`).
 *
 * Entries beyond the CLAUDE.md list are same-family inventions: the spelling
 * without the hyphen, or the obvious made-up word for a term from the positive
 * list (Vault → "Tresor", Management Fee → "Verwaltungsgebühr").
 */
export const FORBIDDEN_GERMAN_TERMS = [
  // Verbatim from CLAUDE.md.
  'gestreckter Kauf',
  'Verlust-Grenze',
  'Preis-Gitter',
  'Erfolgsbeteiligung',
  'Höchstmarke',
  'Grundgebühr',
  'Gesundheitsfaktor',
  'Ausführer',
  'Rabatt-Vektor',
  'Mindest-Ausgabe',
  'Tausch',
  // Same inventions, written without the hyphen.
  'Verlustgrenze',
  'Preisgitter',
  'Rabattvektor',
  'Mindestausgabe',
  // The obvious home-made word for a term from the positive list.
  'Tresor',
  'Erfolgsgebühr',
  'Einzahlungsgebühr',
  'Auszahlungsgebühr',
  'Verwaltungsgebühr',
  'Schlupf',
] as const;

export type ForbiddenTerm = (typeof FORBIDDEN_GERMAN_TERMS)[number];

/**
 * Matches a term where a word begins — so "Tausch" is caught in "Tausch" and
 * "Tauschgebühr", but not in the harmless "Austausch", whose ending merely
 * happens to look like it.
 */
function occursIn(term: string, text: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![A-Za-zÄÖÜäöüß])${escaped}`, 'i').test(text);
}

/** Every forbidden term the text contains, in list order. */
export function findForbiddenTerms(text: string): string[] {
  return FORBIDDEN_GERMAN_TERMS.filter((term) => occursIn(term, text));
}

/**
 * Walks a catalog and yields `[dotted.key, value]` for every string in it, so
 * a failing test can name the exact entry rather than "somewhere in German".
 */
export function* catalogEntries(
  catalog: unknown,
  path: readonly string[] = [],
): Generator<[string, string]> {
  if (typeof catalog === 'string') {
    yield [path.join('.'), catalog];
    return;
  }
  if (catalog && typeof catalog === 'object') {
    for (const [key, value] of Object.entries(catalog)) {
      yield* catalogEntries(value, [...path, key]);
    }
  }
}
