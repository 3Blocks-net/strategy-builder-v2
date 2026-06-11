#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { stdin, stdout, argv, exit } from 'node:process';
import { deleteKeystorePassword, writeKeystorePassword, KEYCHAIN_SERVICE } from '../keychain.js';
import { performOnboarding } from '../onboarding.js';

const expandHome = (p: string) => p.replace(/^~(?=$|\/|\\)/, homedir());

/** Liest eine Zeile; bei `hidden` werden Tastenanschläge nicht angezeigt. */
function ask(question: string, hidden = false): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  return new Promise((resolve) => {
    if (hidden) {
      const mutableOut = rl as unknown as { _writeToOutput?: (s: string) => void };
      mutableOut._writeToOutput = (str: string) => {
        if (str.includes(question)) stdout.write(str);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

async function main(): Promise<void> {
  const account = process.env.PECUNITY_KEYCHAIN_ACCOUNT?.trim() || 'default';

  if (argv.includes('--remove')) {
    const removed = await deleteKeystorePassword(account);
    stdout.write(
      removed
        ? `✓ Wallet-Zugang entfernt (Keychain-Service "${KEYCHAIN_SERVICE}", Account "${account}").\n`
        : `Kein hinterlegter Zugang für Account "${account}" gefunden.\n`,
    );
    return;
  }

  stdout.write('Pecunity MCP — Onboarding\n');
  stdout.write(
    'Prüft dein Keystore-Passwort gegen den Keystore und hinterlegt es erst danach\n' +
      'sicher im OS-Keychain (nie auf der Platte / in claude_desktop_config.json).\n\n',
  );

  // Keystore-Pfad: Env oder interaktiv.
  let keystorePath = process.env.PECUNITY_KEYSTORE_PATH?.trim();
  if (!keystorePath) {
    keystorePath = await ask('Pfad zum verschlüsselten Keystore: ');
  }
  if (!keystorePath) {
    stdout.write('Abgebrochen: kein Keystore-Pfad.\n');
    exit(1);
  }

  await performOnboarding({
    keystorePath: expandHome(keystorePath),
    account,
    backendUrl: process.env.PECUNITY_BACKEND_URL?.trim(),
    frontendUrl: process.env.PECUNITY_FRONTEND_URL?.trim(),
    readKeystoreFile: (path) => readFile(path, 'utf8'),
    promptPassword: () => ask(`Keystore-Passwort (Account "${account}"): `, true),
    writePassword: writeKeystorePassword,
    output: (line) => stdout.write(line + '\n'),
  });
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : 'Unbekannter Fehler.';
  stdout.write(`Init fehlgeschlagen: ${message}\n`);
  exit(1);
});
