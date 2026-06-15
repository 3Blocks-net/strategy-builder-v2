import { WalletSigner } from './wallet-signer.js';
import { KEYCHAIN_SERVICE } from './keychain.js';

export interface OnboardingDeps {
  keystorePath: string;
  account: string;
  backendUrl?: string;
  frontendUrl?: string;
  /** Liest die Keystore-Datei (wirft, wenn nicht vorhanden/lesbar). */
  readKeystoreFile: (path: string) => Promise<string>;
  /** Fragt das Passwort maskiert ab. */
  promptPassword: () => Promise<string>;
  /** Schreibt das verifizierte Passwort in den OS-Keychain. */
  writePassword: (account: string, password: string) => Promise<void>;
  output: (line: string) => void;
}

/**
 * Geführtes Onboarding mit **verify-before-store**: liest den Keystore, fragt das
 * Passwort, prüft per `WalletSigner.fromKeystore`, dass es den Keystore wirklich
 * entschlüsselt — und schreibt es **erst danach** in den Keychain. Bei falschem
 * Passwort / fehlender Datei wird **nichts** gespeichert (fail-fast). Gibt die
 * abgeleitete Owner-Adresse und einen Config-Schnipsel (ohne Passwort) aus.
 *
 * Bewusst KEIN First-Class-Einlesen roher Private Keys (sicherheitsrelevant) —
 * der rohe Key bleibt das markierte Dev-Beispiel (make-keystore.mjs).
 */
export async function performOnboarding(deps: OnboardingDeps): Promise<void> {
  let keystoreJson: string;
  try {
    keystoreJson = await deps.readKeystoreFile(deps.keystorePath);
  } catch {
    throw new Error(
      `Keystore-Datei nicht lesbar: ${deps.keystorePath}. Pfad prüfen (PECUNITY_KEYSTORE_PATH).`,
    );
  }

  const password = await deps.promptPassword();
  if (!password) throw new Error('Abgebrochen: kein Passwort eingegeben.');

  // verify-before-store — erst entschlüsseln, dann (und nur dann) speichern.
  let address: string;
  try {
    const signer = await WalletSigner.fromKeystore(keystoreJson, password);
    address = signer.address;
  } catch {
    throw new Error(
      'Passwort entschlüsselt den Keystore nicht — es wurde NICHTS im Keychain gespeichert.',
    );
  }

  await deps.writePassword(deps.account, password);

  deps.output(
    `✓ Verifiziert & im OS-Keychain hinterlegt (Service "${KEYCHAIN_SERVICE}", Account "${deps.account}").`,
  );
  deps.output(`  Owner-Adresse: ${address}`);
  deps.output('');
  deps.output(configSnippet(deps));
}

function configSnippet(deps: OnboardingDeps): string {
  const snippet = {
    mcpServers: {
      pecunity: {
        command: 'node',
        args: ['/ABSOLUTER/PFAD/zu/packages/mcp/dist/index.js'],
        env: {
          PECUNITY_BACKEND_URL: deps.backendUrl ?? 'http://localhost:3001',
          PECUNITY_FRONTEND_URL: deps.frontendUrl ?? 'http://localhost:5173',
          PECUNITY_KEYSTORE_PATH: deps.keystorePath,
          PECUNITY_KEYCHAIN_ACCOUNT: deps.account,
        },
      },
    },
  };
  return (
    'Schnipsel für claude_desktop_config.json (Passwort steht bewusst NICHT drin):\n' +
    JSON.stringify(snippet, null, 2)
  );
}
