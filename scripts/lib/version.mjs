// Comparing dotted versions, without a semver dependency.
//
// Both the dev startup and `pnpm dev:doctor` compare the running Node against the
// `engines.node` range in the root package.json; this is the single place that
// knows how.

/**
 * `true` when `actual` is at least `minimum`. An unreadable version on either
 * side counts as "not satisfied": a check that cannot decide must not wave
 * something through.
 */
export function meetsMinimumVersion(actual, minimum) {
  const left = toParts(actual);
  const right = toParts(minimum);
  if (!left || !right) return false;
  for (let i = 0; i < 3; i++) {
    if (left[i] > right[i]) return true;
    if (left[i] < right[i]) return false;
  }
  return true;
}

/** Pulls the minimum version out of an `engines.node` range like `>=22.22.0`. */
export function parseMinimumNodeVersion(enginesNode) {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(String(enginesNode ?? ''));
  return match ? `${match[1]}.${match[2]}.${match[3]}` : null;
}

function toParts(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(version ?? '').trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}
