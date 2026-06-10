import { AuthClient } from './auth-client.js';
import { WalletSigner } from './wallet-signer.js';
import type { McpConfig } from './config.js';

/** Genau eine authentifizierte Owner-Session; alle Tools binden an `address`. */
export interface OwnerSession {
  readonly address: `0x${string}`;
  readonly signer: WalletSigner;
  readonly auth: AuthClient;
  readonly readOnly: boolean;
}

/** Injizierbare Seiteneffekte — in Tests durch Fakes ersetzbar. */
export interface SessionDeps {
  /** Liest das Keystore-Passwort aus dem OS-Keychain. */
  readPassword: (account: string) => Promise<string | null>;
  /** Liest die verschlüsselte Keystore-Datei. */
  readKeystoreFile: (path: string) => Promise<string>;
  /** HTTP-Client für den Auth-Handshake. */
  fetchFn?: typeof fetch;
}

/**
 * Baut die Owner-Session auf: Passwort aus dem Keychain → Keystore entschlüsseln
 * → Owner-Adresse ableiten → SIWE-Handshake. Fehler sind bewusst sicher
 * formuliert (kein Stacktrace-Leak, keine Key-/Passwort-Fragmente).
 */
export async function connectOwnerSession(
  cfg: McpConfig,
  deps: SessionDeps,
): Promise<OwnerSession> {
  const password = await deps.readPassword(cfg.keychainAccount);
  if (!password) {
    throw new Error(
      'Kein Wallet-Zugang im OS-Keychain hinterlegt. Bitte einmalig `pecunity-mcp-init` ausführen, um Keystore-Passwort zu hinterlegen.',
    );
  }

  let keystoreJson: string;
  try {
    keystoreJson = await deps.readKeystoreFile(cfg.keystorePath);
  } catch {
    throw new Error(
      `Keystore-Datei konnte nicht gelesen werden (${cfg.keystorePath}). Pfad in PECUNITY_KEYSTORE_PATH prüfen.`,
    );
  }

  // WalletSigner wirft bereits sicher (ohne Key-/Passwort-Fragmente).
  const signer = await WalletSigner.fromKeystore(keystoreJson, password);

  const auth = new AuthClient({
    backendUrl: cfg.backendUrl,
    frontendUrl: cfg.frontendUrl,
    chainId: cfg.chainId,
    signer,
    fetchFn: deps.fetchFn,
  });
  await auth.authenticate();

  return { address: signer.address, signer, auth, readOnly: cfg.readOnly };
}
