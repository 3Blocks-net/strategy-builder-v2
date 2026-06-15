/**
 * Protocol-adapter conformance contract (Vault-Cockpit slice #09, Story-4 guard
 * rail). Reusable validators that every `ProtocolAdapter` must satisfy so a new
 * protocol flows into positions / snapshots / PnL without re-designing them.
 *
 * Each validator returns a list of human-readable violations (empty = conforms),
 * so a non-conforming future adapter fails with a clear message.
 */
import { getAddress } from 'ethers';
import { ValuedPosition } from './protocol-adapter';
import { LogSubscription } from '../indexer/protocol-flow';

function isValidAddress(a: unknown): boolean {
  if (typeof a !== 'string') return false;
  try {
    getAddress(a);
    return true;
  } catch {
    return false;
  }
}

/** Validate a single ValuedPosition against the contract the cockpit relies on. */
export function validateValuedPosition(p: ValuedPosition): string[] {
  const errs: string[] = [];
  if (!p.protocol) errs.push('missing protocol');
  if (!p.kind) errs.push('missing kind');
  if (typeof p.label !== 'string') errs.push('missing label');
  if (!Array.isArray(p.legs)) errs.push('legs must be an array');
  if (!('valueUsd' in p)) errs.push('missing valueUsd');
  if (p.valueUsd !== null && typeof p.valueUsd !== 'number')
    errs.push('valueUsd must be number|null');

  for (const leg of p.legs ?? []) {
    if (!isValidAddress(leg.token)) errs.push(`leg.token invalid: ${leg.token}`);
    if (typeof leg.decimals !== 'number') errs.push('leg.decimals must be number');
    if (typeof leg.amount !== 'string')
      errs.push('leg.amount must be a base-unit string (no float)');
    if (leg.amountUsd !== null && typeof leg.amountUsd !== 'number')
      errs.push('leg.amountUsd must be number|null');
  }

  // Debt sign convention: a debt leg must not net to positive equity.
  const hasDebtLeg = (p.legs ?? []).some((l) => l.isDebt);
  if (hasDebtLeg && typeof p.valueUsd === 'number' && p.valueUsd > 0)
    errs.push('a debt position must have valueUsd ≤ 0');
  if (p.kind === 'borrow' && p.debtUsd == null)
    errs.push('a borrow position must carry debtUsd');

  return errs;
}

/** Validate the full positions output of an adapter. */
export function validatePositions(positions: ValuedPosition[]): string[] {
  if (!Array.isArray(positions)) return ['getPositions must return an array'];
  return positions.flatMap((p, i) =>
    validateValuedPosition(p).map((e) => `position[${i}]: ${e}`),
  );
}

/** Validate `claimedTokens` output (non-empty, valid addresses). */
export function validateClaimedTokens(tokens: string[]): string[] {
  const errs: string[] = [];
  if (!Array.isArray(tokens) || tokens.length === 0)
    errs.push('claimedTokens must be a non-empty array');
  for (const t of tokens ?? [])
    if (!isValidAddress(t)) errs.push(`claimed token invalid: ${t}`);
  return errs;
}

/** Validate a single log subscription descriptor. */
export function validateLogSubscription(sub: LogSubscription): string[] {
  const errs: string[] = [];
  if (!isValidAddress(sub.address)) errs.push('subscription.address invalid');
  if (typeof sub.topic0 !== 'string' || !sub.topic0.startsWith('0x'))
    errs.push('subscription.topic0 must be a 0x hash');
  if (
    !Number.isInteger(sub.vaultTopicIndex) ||
    sub.vaultTopicIndex < 1 ||
    sub.vaultTopicIndex > 3
  )
    errs.push('vaultTopicIndex must be an integer in 1..3');
  if (typeof sub.toDraft !== 'function') errs.push('toDraft must be a function');
  if (!sub.iface) errs.push('iface required');
  return errs;
}
