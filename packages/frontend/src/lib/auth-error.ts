import type { TFunction } from 'i18next';

/**
 * The sign-in failures the app recognises itself and can therefore phrase in
 * the reader's language. Rejecting the signature in the wallet is the common
 * one; everything else arrives as a wallet or server message.
 */
export type AuthErrorCode = 'signature-rejected' | 'sign-in-failed';

/**
 * What the sign-in kept about a failure: the reason, plus the words it arrived
 * in. The reason is what the provider stores — the sentence is looked up when
 * the page renders, so a language switch after the failure still reaches it.
 */
export interface AuthFailure {
  code: AuthErrorCode;
  message: string | null;
}

/**
 * The line shown under a failed sign-in.
 *
 * A failure the app named gets a translated sentence; a message that came from
 * the wallet or the server is passed through in the words it arrived in —
 * translating it would mean inventing detail we do not have.
 */
export function authErrorText(
  t: TFunction,
  failure: AuthFailure | null,
): string | null {
  if (!failure) return null;
  if (failure.code === 'signature-rejected')
    return t('connect.errorSignatureRejected');
  return failure.message ?? t('connect.errorSignInFailed');
}
