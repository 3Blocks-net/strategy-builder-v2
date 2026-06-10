import keytar from 'keytar';

/** Fester Service-Name im OS-Keychain (macOS Keychain / Windows Cred Manager / libsecret). */
export const KEYCHAIN_SERVICE = 'pecunity-mcp';

/** Liest das Keystore-Passwort headless aus dem OS-Keychain. */
export async function readKeystorePassword(account: string): Promise<string | null> {
  return keytar.getPassword(KEYCHAIN_SERVICE, account);
}

/** Schreibt das Keystore-Passwort in den OS-Keychain (genutzt vom Init-CLI). */
export async function writeKeystorePassword(
  account: string,
  password: string,
): Promise<void> {
  await keytar.setPassword(KEYCHAIN_SERVICE, account, password);
}

/** Entfernt das Keystore-Passwort aus dem OS-Keychain (Trennen/Entfernen des Zugangs). */
export async function deleteKeystorePassword(account: string): Promise<boolean> {
  return keytar.deletePassword(KEYCHAIN_SERVICE, account);
}
