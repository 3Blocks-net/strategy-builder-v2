export interface McpConfig {
  /** Basis-URL des Pecunity-Backends. */
  backendUrl: string;
  /** Frontend-URL; ihr Host ist die SIWE-`domain`. */
  frontendUrl: string;
  /** Chain-ID (BSC mainnet = 56). */
  chainId: number;
  /** Pfad zum verschlüsselten JSON-Keystore. */
  keystorePath: string;
  /** Keychain-Account-Schlüssel, unter dem das Keystore-Passwort liegt. */
  keychainAccount: string;
  /** Read-only-Modus: deaktiviert (in späteren Slices) alle write/signing-Tools. */
  readOnly: boolean;
}

import { homedir } from 'node:os';

/** Expandiert ein führendes `~` (Env-Pfade werden nicht von der Shell expandiert). */
function expandHome(path: string): string {
  return path.replace(/^~(?=$|\/|\\)/, homedir());
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value || value.trim() === '') {
    throw new Error(
      `Fehlende Konfiguration: ${key}. Bitte in der MCP-Server-Konfiguration (Claude Desktop) setzen.`,
    );
  }
  return value;
}

/** Lädt und validiert die MCP-Konfiguration aus den Umgebungsvariablen. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
  return {
    backendUrl: required(env, 'PECUNITY_BACKEND_URL'),
    frontendUrl: required(env, 'PECUNITY_FRONTEND_URL'),
    chainId: env.PECUNITY_CHAIN_ID ? Number(env.PECUNITY_CHAIN_ID) : 56,
    keystorePath: expandHome(required(env, 'PECUNITY_KEYSTORE_PATH')),
    keychainAccount: env.PECUNITY_KEYCHAIN_ACCOUNT?.trim() || 'default',
    readOnly: env.PECUNITY_READ_ONLY === 'true',
  };
}
