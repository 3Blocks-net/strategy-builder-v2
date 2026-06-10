#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadConfig } from './config.js';
import { connectOwnerSession } from './session.js';
import { readKeystorePassword } from './keychain.js';
import { whoami } from './tools/whoami.js';
import { BackendClient } from './backend-client.js';
import {
  listVaults,
  getVault,
  getPortfolio,
  listAutomations,
  getExecutions,
  getPositions,
  getPerformance,
  getValueHistory,
} from './tools/read-tools.js';
import { SECURITY_NOTICE } from './security-notice.js';

/** Read-Tool-Ergebnis als LLM-freundlicher, eingerückter JSON-Text. */
function jsonResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

async function main(): Promise<void> {
  const config = loadConfig();

  // Erst-Verbindungs-Sicherheitshinweis (stderr — stdout gehört dem MCP-Kanal).
  process.stderr.write(SECURITY_NOTICE + '\n');

  const session = await connectOwnerSession(config, {
    readPassword: readKeystorePassword,
    readKeystoreFile: (path) => readFile(path, 'utf8'),
  });
  process.stderr.write(`[pecunity-mcp] Verbunden als ${session.address}\n`);

  const backend = new BackendClient({ backendUrl: config.backendUrl, auth: session.auth });
  const server = new McpServer({ name: 'pecunity-mcp', version: '1.0.0' });

  server.registerTool(
    'whoami',
    {
      title: 'Verbundene Wallet-Adresse',
      description:
        'Gibt die Owner-Adresse zurück, mit der dieser Server verbunden ist. ' +
        'Alle weiteren Tools operieren ausschließlich auf den Vaults dieser Adresse.',
      outputSchema: { address: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const { address } = whoami(session);
      return {
        content: [{ type: 'text', text: `Verbunden als ${address}` }],
        structuredContent: { address },
      };
    },
  );

  const readOnly = { readOnlyHint: true, openWorldHint: true } as const;

  server.registerTool(
    'list_vaults',
    {
      title: 'Vaults auflisten',
      description: 'Listet alle Vaults der verbundenen Owner-Adresse (Adresse, Label, Deposit-Token).',
      annotations: readOnly,
    },
    async () => jsonResult(await listVaults(backend)),
  );

  server.registerTool(
    'get_vault',
    {
      title: 'Vault-Details',
      description: 'Liefert einen Vault der verbundenen Adresse inkl. Gas-Deposit-Stand.',
      inputSchema: { address: z.string().describe('Vault-Adresse (0x…)') },
      annotations: readOnly,
    },
    async ({ address }) => jsonResult(await getVault(backend, address)),
  );

  server.registerTool(
    'get_portfolio',
    {
      title: 'Portfolio/Bestände',
      description: 'Liefert die Token-Bestände eines Vaults mit USD-Werten.',
      inputSchema: { address: z.string().describe('Vault-Adresse (0x…)') },
      annotations: readOnly,
    },
    async ({ address }) => jsonResult(await getPortfolio(backend, address)),
  );

  server.registerTool(
    'list_automations',
    {
      title: 'Automations auflisten',
      description:
        'Listet die Automations eines Vaults (aktiv/pausiert, owner-only/public, Schrittzahl).',
      inputSchema: { address: z.string().describe('Vault-Adresse (0x…)') },
      annotations: readOnly,
    },
    async ({ address }) => jsonResult(await listAutomations(backend, address)),
  );

  server.registerTool(
    'get_executions',
    {
      title: 'Ausführungsverlauf',
      description:
        'Ausführungsverlauf eines Vaults: erfolgreiche Runs, Deposits/Withdraws und ' +
        'dekodierte Fehlschläge (Step N: <reason>).',
      inputSchema: {
        address: z.string().describe('Vault-Adresse (0x…)'),
        automationId: z.number().int().optional().describe('Nur Runs dieser On-Chain-Automation'),
        page: z.number().int().optional(),
        pageSize: z.number().int().optional(),
      },
      annotations: readOnly,
    },
    async ({ address, automationId, page, pageSize }) =>
      jsonResult(await getExecutions(backend, address, { automationId, page, pageSize })),
  );

  server.registerTool(
    'get_positions',
    {
      title: 'DeFi-Positionen',
      description:
        'Vereinheitlichte, USD-bewertete Positionssicht eines Vaults: idle Token, ' +
        'Gas-Reserve, Protokoll-Adapter-Positionen (Aave/PancakeSwap) und Netto-Equity.',
      inputSchema: {
        address: z.string().describe('Vault-Adresse (0x…)'),
        refresh: z.boolean().optional().describe('Live neu berechnen statt letzten Snapshot'),
      },
      annotations: readOnly,
    },
    async ({ address, refresh }) => jsonResult(await getPositions(backend, address, { refresh })),
  );

  const rangeSchema = z
    .enum(['24h', '7d', '30d', 'all'])
    .optional()
    .describe('Zeitbereich (Default backend-seitig)');

  server.registerTool(
    'get_performance',
    {
      title: 'Performance (PnL)',
      description: 'PnL vs. Netto-Einzahlungen + Kosten (Fees + Gas) über einen Zeitbereich.',
      inputSchema: { address: z.string().describe('Vault-Adresse (0x…)'), range: rangeSchema },
      annotations: readOnly,
    },
    async ({ address, range }) => jsonResult(await getPerformance(backend, address, { range })),
  );

  server.registerTool(
    'get_value_history',
    {
      title: 'Wertverlauf',
      description: 'USD-Wertverlauf über die Zeit + Deposit/Withdraw-Marker.',
      inputSchema: { address: z.string().describe('Vault-Adresse (0x…)'), range: rangeSchema },
      annotations: readOnly,
    },
    async ({ address, range }) => jsonResult(await getValueHistory(backend, address, { range })),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err: unknown) => {
  // Sichere Fehlerausgabe — keine Stacktraces, keine Key-/Passwort-Fragmente.
  const message = err instanceof Error ? err.message : 'Unbekannter Fehler beim Start.';
  process.stderr.write(`[pecunity-mcp] Start fehlgeschlagen: ${message}\n`);
  process.exit(1);
});
