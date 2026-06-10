#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { stdin, stdout, argv, exit } from 'node:process';
import {
  writeKeystorePassword,
  deleteKeystorePassword,
  KEYCHAIN_SERVICE,
} from '../keychain.js';

/** Liest eine Zeile; bei `hidden` werden Tastenanschläge nicht angezeigt. */
function ask(question: string, hidden = false): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  return new Promise((resolve) => {
    if (hidden) {
      // Eingabe maskieren: stdout-Echo der readline unterdrücken.
      const mutableOut = rl as unknown as { output: NodeJS.WritableStream; _writeToOutput?: (s: string) => void };
      mutableOut._writeToOutput = (str: string) => {
        if (str.includes(question)) stdout.write(str);
        // Tastenanschläge der Antwort nicht echoen.
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
    'Hinterlegt das Passwort deines verschlüsselten Keystores sicher im OS-Keychain.\n' +
      'Es wird NICHT auf der Platte oder in claude_desktop_config.json gespeichert.\n\n',
  );

  const password = await ask(`Keystore-Passwort (Account "${account}"): `, true);
  if (!password) {
    stdout.write('Abgebrochen: kein Passwort eingegeben.\n');
    exit(1);
  }
  const confirm = await ask('Passwort bestätigen: ', true);
  if (password !== confirm) {
    stdout.write('Abgebrochen: Passwörter stimmen nicht überein.\n');
    exit(1);
  }

  await writeKeystorePassword(account, password);
  stdout.write(
    `\n✓ Passwort im OS-Keychain hinterlegt (Service "${KEYCHAIN_SERVICE}", Account "${account}").\n` +
      'Der MCP-Server liest es zur Laufzeit headless. Du kannst Claude Desktop jetzt starten.\n',
  );
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : 'Unbekannter Fehler.';
  stdout.write(`Init fehlgeschlagen: ${message}\n`);
  exit(1);
});
