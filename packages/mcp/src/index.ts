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
import { listStepTypes, describeStepType } from './tools/catalog-tools.js';
import { listRecipes } from './tools/recipe-tools.js';
import { fileAuditLog } from './audit-log.js';
import { PolicyGate } from './policy-gate.js';
import {
  ElicitationConfirmationProvider,
  LocalhostConfirmationProvider,
  CompositeConfirmationProvider,
} from './confirmation.js';
import { createVault } from './tools/create-vault.js';
import { buildSendCreateVault } from './chain.js';
import { SECURITY_NOTICE } from './security-notice.js';

/**
 * Nur **strukturelle** „Client unterstützt Elicitation nicht"-Fehler → localhost-
 * Fallback. Schema-/Validierungsfehler der Elicitation-Antwort dürfen NICHT
 * herfallen (sonst stilles Umleiten) — sie propagieren als hartes Fail.
 */
function isElicitationUnsupported(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /Client does not support (form |url )?elicitation/i.test(msg) ||
    /method not found/i.test(msg) ||
    msg.includes('-32601')
  );
}

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

  server.registerTool(
    'list_step_types',
    {
      title: 'StepType-Katalog',
      description:
        'Listet alle tatsächlich deployten Bausteine (Conditions + Actions): ' +
        'Name, Kategorie, Kurzbeschreibung. Basis fürs Assemblieren von Automations.',
      annotations: readOnly,
    },
    async () => jsonResult(await listStepTypes(backend)),
  );

  server.registerTool(
    'describe_step_type',
    {
      title: 'StepType-Detail',
      description:
        'Detailbeschreibung eines StepTypes: paramSchema (JSON-Schema-treu, mit Defaults ' +
        'und Param-Bedeutungen) sowie gelesene/geschriebene Kontext-Slots.',
      inputSchema: { id: z.string().describe('StepType-ID') },
      annotations: readOnly,
    },
    async ({ id }) => jsonResult(await describeStepType(backend, id)),
  );

  server.registerTool(
    'list_recipes',
    {
      title: 'Recipe-Referenzen',
      description:
        'Kuratierte Beispiel-Shapes (z. B. DCA) als Few-Shot-Referenz für gute ' +
        'Graph-Formen — Platzhalter-Graphen mit stabilen Step-Type-Namen, keine Adressen. ' +
        'Anleitung, bevor frei aus dem Katalog assembliert wird.',
      annotations: readOnly,
    },
    async () => jsonResult(await listRecipes(backend)),
  );

  // --- Schreibende Tools: PolicyGate (Confirm-Gate) + Audit-Log ---
  const audit = fileAuditLog(config.auditLogPath);
  const confirmation = new CompositeConfirmationProvider(
    new ElicitationConfirmationProvider(server.server),
    new LocalhostConfirmationProvider(),
    isElicitationUnsupported,
  );
  const gate = new PolicyGate({ readOnly: config.readOnly }, confirmation, audit);

  if (config.rpcUrl && config.factoryAddress) {
    const sendCreateVault = buildSendCreateVault(session.signer, {
      rpcUrl: config.rpcUrl,
      factoryAddress: config.factoryAddress,
    });
    server.registerTool(
      'create_vault',
      {
        title: 'Vault erstellen',
        description:
          'Erstellt in deinem Namen einen neuen Vault (Deposit-Token, optional Label). ' +
          'Validiert den Deposit-Token gegen die FeeRegistry, erfordert eine explizite ' +
          'Bestätigung (Confirm-Gate) und signiert die Transaktion.',
        inputSchema: {
          depositToken: z
            .string()
            .regex(/^0x[0-9a-fA-F]{40}$/, 'Ungültige EVM-Adresse (erwartet 0x + 40 Hex-Zeichen)')
            .describe('Deposit-Token-Adresse (0x…), von der FeeRegistry akzeptiert'),
          label: z.string().max(64).optional().describe('Optionales Label des Vaults (max. 64 Zeichen)'),
        },
        annotations: { readOnlyHint: false, openWorldHint: true },
      },
      async ({ depositToken, label }) =>
        jsonResult(
          await createVault(
            {
              backend,
              gate,
              ownerAddress: session.address,
              chainId: config.chainId,
              sendCreateVault,
            },
            { depositToken, label },
          ),
        ),
    );
  } else {
    process.stderr.write(
      '[pecunity-mcp] Hinweis: create_vault deaktiviert — PECUNITY_RPC_URL und PECUNITY_FACTORY_ADDRESS setzen, um schreibende Tools zu aktivieren.\n',
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err: unknown) => {
  // Sichere Fehlerausgabe — keine Stacktraces, keine Key-/Passwort-Fragmente.
  const message = err instanceof Error ? err.message : 'Unbekannter Fehler beim Start.';
  process.stderr.write(`[pecunity-mcp] Start fehlgeschlagen: ${message}\n`);
  process.exit(1);
});
