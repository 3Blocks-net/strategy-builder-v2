#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadConfig } from './config.js';
import { connectOwnerSession } from './session.js';
import { readKeystorePassword } from './keychain.js';
import { whoami } from './tools/whoami.js';
import { SECURITY_NOTICE } from './security-notice.js';

async function main(): Promise<void> {
  const config = loadConfig();

  // Erst-Verbindungs-Sicherheitshinweis (stderr — stdout gehört dem MCP-Kanal).
  process.stderr.write(SECURITY_NOTICE + '\n');

  const session = await connectOwnerSession(config, {
    readPassword: readKeystorePassword,
    readKeystoreFile: (path) => readFile(path, 'utf8'),
  });
  process.stderr.write(`[pecunity-mcp] Verbunden als ${session.address}\n`);

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

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err: unknown) => {
  // Sichere Fehlerausgabe — keine Stacktraces, keine Key-/Passwort-Fragmente.
  const message = err instanceof Error ? err.message : 'Unbekannter Fehler beim Start.';
  process.stderr.write(`[pecunity-mcp] Start fehlgeschlagen: ${message}\n`);
  process.exit(1);
});
