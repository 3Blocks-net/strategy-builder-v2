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
  /** Read-only-Modus: deaktiviert alle write/signing-Tools. */
  readOnly: boolean;
  /** RPC-URL für On-chain-Reads/Sends (nötig für schreibende Tools). */
  rpcUrl?: string;
  /** Adresse der StrategyBuilderVaultFactory (nötig für create_vault). */
  factoryAddress?: string;
  /** PancakeSwap-V3-Factory (Pool-Existenz-Check); Default BSC-Mainnet. */
  pcsFactoryAddress: string;
  /** Pfad der lokalen append-only Audit-Log-Datei. */
  auditLogPath: string;
  /** Erlaubte Geld-Ziele (lowercased) für Withdraw/Transfer; Owner wird ergänzt. */
  addressAllowlist: Set<string>;
  /** Freigeschaltete sensible Step-Types (Namen) — Capability-Opt-in. */
  enabledSensitiveSteps: Set<string>;
  /** lowercased Token-Adresse → human Max-Betrag pro Einzelaktion (deposit/withdraw). */
  maxPerToken: Map<string, string>;
}

function parseTokenAmounts(value: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of (value ?? '').split(',')) {
    const [addr, amount] = entry.split(':').map((s) => s.trim());
    if (addr && amount) map.set(addr.toLowerCase(), amount);
  }
  return map;
}

function parseList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
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
    rpcUrl: env.PECUNITY_RPC_URL?.trim() || undefined,
    factoryAddress: env.PECUNITY_FACTORY_ADDRESS?.trim() || undefined,
    pcsFactoryAddress:
      env.PECUNITY_PCS_FACTORY_ADDRESS?.trim() ||
      '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
    auditLogPath: expandHome(
      env.PECUNITY_AUDIT_LOG_PATH?.trim() || '~/.pecunity/audit.log',
    ),
    addressAllowlist: new Set(
      parseList(env.PECUNITY_ADDRESS_ALLOWLIST).map((a) => a.toLowerCase()),
    ),
    enabledSensitiveSteps: new Set(parseList(env.PECUNITY_ENABLED_SENSITIVE_STEPS)),
    maxPerToken: parseTokenAmounts(env.PECUNITY_MAX_AMOUNT_PER_TOKEN),
  };
}
