import type { TFunction } from 'i18next';

/**
 * The transaction failures the app detects itself and can therefore phrase in
 * the reader's language. Everything else that goes wrong on-chain arrives as a
 * revert reason or wallet message.
 */
export type TxErrorCode =
  | 'factory-missing'
  | 'transaction-failed'
  | 'vault-address-unparsable';

/**
 * The line shown under a failed transaction.
 *
 * A failure the app named gets a translated sentence; a message that came from
 * the chain or the wallet is passed through in the words it arrived in —
 * translating it would mean inventing detail we do not have.
 */
export function txErrorText(
  t: TFunction,
  code: TxErrorCode | null,
  message: string | null,
): string | null {
  if (code) return t(`txError.${code}`);
  return message;
}
