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
import { buildSendCreateVault, buildDeployOnChain } from './chain.js';
import { proposeAutomation } from './tools/propose-automation.js';
import { deployAutomation } from './tools/deploy-automation.js';
import { deposit, withdraw, simulateAction } from './tools/money-movement.js';
import { topUpGasDeposit, setMinFeeDeposit, setAutomationActive } from './tools/lifecycle.js';
import {
  buildDepositOnChain,
  buildWithdrawOnChain,
  buildEstimate,
  buildTopUpGasOnChain,
  buildSetMinFeeOnChain,
  buildSetAutomationActiveOnChain,
} from './money-chain.js';
import { DraftStore } from './draft-store.js';
import { loadCatalog, loadTokenDecimals, makeGetPool } from './automation-deps.js';
import { makeAssertOwnedVault } from './vault-guard.js';
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
  const draftStore = new DraftStore();

  // --- AI-Building: propose_automation (Build ohne Deploy) ---
  const nodeSchema = z.object({
    id: z.string(),
    type: z.string().optional().describe("'CONDITION' oder 'ACTION'"),
    data: z.object({ stepTypeId: z.string(), params: z.record(z.string(), z.unknown()) }),
  });
  const edgeSchema = z.object({
    source: z.string(),
    target: z.string(),
    sourceHandle: z.string().nullable().optional().describe("'true' | 'false' | 'out'"),
  });
  const intentSchema = z.object({
    execution: z.enum(['public', 'owner']).describe('autonom feuernd (public) vs. nur durch Owner'),
    trigger: z.object({ periodSeconds: z.number().int().optional() }).optional(),
    actions: z
      .array(
        z.object({
          token: z.string().optional(),
          direction: z.union([z.string(), z.number()]).optional(),
          amount: z.string().optional().describe('human-Betrag, z. B. "50"'),
        }),
      )
      .describe('geordnete Action-Liste — muss zum Graphen passen, sonst Reject'),
  });

  server.registerTool(
    'propose_automation',
    {
      title: 'Automation vorschlagen (ohne Deploy)',
      description:
        'Baut aus einem Graphen einen validierten Entwurf — OHNE zu signieren. friendly→raw ' +
        'über die Encode-Boundary (ungültig → Ablehnung mit Erklärung), Pool-/Token-Checks, ' +
        'und ein Intent-Cross-Check (deklarierter Intent vs. server-decodierter Graph → Reject ' +
        'bei Abweichung). Gibt eine Draft-ID + Summary zurück; deploy_automation nimmt nur die ID.',
      inputSchema: {
        vaultAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/).describe('Vault-Adresse (0x…)'),
        graph: z.object({ nodes: z.array(nodeSchema), edges: z.array(edgeSchema) }),
        intent: intentSchema,
      },
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    async ({ vaultAddress, graph, intent }) => {
      const [catalog, tokenDecimals] = await Promise.all([
        loadCatalog(backend),
        loadTokenDecimals(backend),
      ]);
      const getPool = config.rpcUrl
        ? makeGetPool(config.rpcUrl, config.pcsFactoryAddress)
        : undefined;
      return jsonResult(
        await proposeAutomation(
          { backend, draftStore, catalog, tokenDecimals, getPool },
          { vaultAddress, graph: graph as never, intent: intent as never },
        ),
      );
    },
  );

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

  if (config.rpcUrl) {
    server.registerTool(
      'deploy_automation',
      {
        title: 'Automation deployen',
        description:
          'Deployt einen mit propose_automation erstellten Entwurf — nimmt NUR die Draft-ID ' +
          'und signiert exakt den gespeicherten Graphen. Confirm-Gate bei sensiblen Steps ' +
          '(Summary aus dem gespeicherten Entwurf); In-Automation-Empfänger-Allowlist + ' +
          'Capability-Opt-in werden erzwungen. Liefert On-Chain-Automation-ID + TX-Hashes.',
        inputSchema: { draftId: z.string().describe('Draft-ID aus propose_automation') },
        annotations: { readOnlyHint: false, openWorldHint: true },
      },
      async ({ draftId }) => {
        const deployOnChain = buildDeployOnChain(session.signer, backend, config.rpcUrl!);
        return jsonResult(
          await deployAutomation(
            {
              gate,
              draftStore,
              config: {
                ownerAddress: session.address,
                // Owner ist immer ein erlaubtes Geld-Ziel.
                addressAllowlist: new Set([
                  session.address.toLowerCase(),
                  ...config.addressAllowlist,
                ]),
                enabledSensitiveSteps: config.enabledSensitiveSteps,
              },
              deployOnChain,
            },
            { draftId },
          ),
        );
      },
    );
  }

  if (config.rpcUrl) {
    const rpcUrl = config.rpcUrl;
    const addr = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
    const assertVault = makeAssertOwnedVault(backend);

    // Chain-Executors einmal bauen (Signer + rpcUrl sind pro Session konstant).
    const depositOnChain = buildDepositOnChain(session.signer, rpcUrl, session.address);
    const withdrawOnChain = buildWithdrawOnChain(session.signer, rpcUrl);
    const estimate = buildEstimate(rpcUrl, session.address);
    const topUpGasOnChain = buildTopUpGasOnChain(session.signer, rpcUrl);
    const setMinFeeOnChain = buildSetMinFeeOnChain(session.signer, rpcUrl);
    const setAutomationActiveOnChain = buildSetAutomationActiveOnChain(session.signer, rpcUrl);

    // Token-Decimals mit kurzer TTL cachen (Decimals sind on-chain immutabel).
    let decimalsCache: { value: Record<string, number>; ts: number } | null = null;
    const getTokenDecimals = async (): Promise<Record<string, number>> => {
      if (!decimalsCache || Date.now() - decimalsCache.ts > 60_000) {
        decimalsCache = { value: await getTokenDecimals(), ts: Date.now() };
      }
      return decimalsCache.value;
    };

    const moneyConfig = {
      ownerAddress: session.address,
      addressAllowlist: new Set([session.address.toLowerCase(), ...config.addressAllowlist]),
      maxPerToken: config.maxPerToken,
    };
    const moneyDepsBase = (tokenDecimals: Record<string, number>) => ({
      gate, backend, tokenDecimals, config: moneyConfig, assertVault, depositOnChain, withdrawOnChain,
    });

    server.registerTool(
      'deposit',
      {
        title: 'In Vault einzahlen',
        description: 'Zahlt einen Token-Betrag in einen Vault ein (ggf. ERC20-Approve). Confirm-Gate, Fee transparent.',
        inputSchema: { vault: addr.describe('Vault-Adresse'), token: addr.describe('Token-Adresse'), amount: z.string().describe('Betrag in human units, z. B. "50"') },
        annotations: { readOnlyHint: false, openWorldHint: true },
      },
      async ({ vault, token, amount }) =>
        jsonResult(await deposit(moneyDepsBase(await getTokenDecimals()), { vault, token, amount })),
    );

    server.registerTool(
      'withdraw',
      {
        title: 'Aus Vault auszahlen',
        description: 'Zahlt einen Token-Betrag an einen Empfänger aus (nur Allowlist-Ziele). Confirm-Gate, Fee transparent.',
        inputSchema: { vault: addr.describe('Vault-Adresse'), token: addr.describe('Token-Adresse'), amount: z.string().describe('Betrag in human units'), recipient: addr.describe('Empfänger (muss in der Allowlist sein)') },
        annotations: { readOnlyHint: false, openWorldHint: true },
      },
      async ({ vault, token, amount, recipient }) =>
        jsonResult(await withdraw(moneyDepsBase(await getTokenDecimals()), { vault, token, amount, recipient })),
    );

    server.registerTool(
      'simulate_action',
      {
        title: 'Geldbewegung simulieren (Dry-Run)',
        description: 'Schätzt Gas + Fees für deposit/withdraw, OHNE zu senden und ohne Bestätigung.',
        inputSchema: {
          type: z.enum(['deposit', 'withdraw']),
          vault: addr, token: addr, amount: z.string(),
          recipient: addr.optional().describe('nur für withdraw'),
        },
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ type, vault, token, amount, recipient }) =>
        jsonResult(
          await simulateAction(
            { backend, tokenDecimals: await getTokenDecimals(), estimate },
            { type, vault, token, amount, recipient },
          ),
        ),
    );

    // --- Lifecycle (risikoärmere Writes, nicht-sensibel) ---
    const lifecycleDeps = (tokenDecimals: Record<string, number>) => ({
      gate,
      tokenDecimals,
      maxPerToken: config.maxPerToken,
      assertVault,
      topUpGasOnChain,
      setMinFeeOnChain,
      setAutomationActiveOnChain,
    });

    server.registerTool(
      'top_up_gas_deposit',
      {
        title: 'Gas-Reserve auffüllen',
        description: 'Füllt die Gas-Comp-Reserve des Vaults aus dem Vault-Guthaben auf (depositFees).',
        inputSchema: { vault: addr, token: addr, amount: z.string().describe('Betrag in human units') },
        annotations: { readOnlyHint: false, openWorldHint: true },
      },
      async ({ vault, token, amount }) => {
        const tokenDecimals = await getTokenDecimals();
        return jsonResult(await topUpGasDeposit(lifecycleDeps(tokenDecimals), { vault, token, amount }));
      },
    );

    server.registerTool(
      'set_min_fee_deposit',
      {
        title: 'Auto-Top-up-Ziel setzen',
        description: 'Setzt minFeeDeposit (Auto-Top-up-Ziel der Gas-Reserve).',
        inputSchema: { vault: addr, token: addr.describe('Token für Decimals'), amount: z.string() },
        annotations: { readOnlyHint: false, openWorldHint: true },
      },
      async ({ vault, token, amount }) => {
        const tokenDecimals = await getTokenDecimals();
        return jsonResult(await setMinFeeDeposit(lifecycleDeps(tokenDecimals), { vault, token, amount }));
      },
    );

    server.registerTool(
      'set_automation_active',
      {
        title: 'Automation aktivieren/pausieren',
        description: 'Schaltet eine Automation (per On-Chain-ID) aktiv oder pausiert.',
        inputSchema: { vault: addr, onChainId: z.number().int().describe('On-Chain-Automation-ID'), active: z.boolean() },
        annotations: { readOnlyHint: false, openWorldHint: true },
      },
      async ({ vault, onChainId, active }) =>
        jsonResult(await setAutomationActive(lifecycleDeps({}), { vault, onChainId, active })),
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
