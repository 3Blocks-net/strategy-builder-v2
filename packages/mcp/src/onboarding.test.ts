import { describe, it, expect, vi, beforeAll } from 'vitest';
import { encryptKeystoreJsonSync } from 'ethers';
import { performOnboarding, type OnboardingDeps } from './onboarding.js';

const PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const PASSWORD = 'correct horse';
let keystoreJson: string;

beforeAll(() => {
  keystoreJson = encryptKeystoreJsonSync({ address: ADDRESS, privateKey: PRIVATE_KEY }, PASSWORD, { scrypt: { N: 1 << 8 } });
});

function deps(over: Partial<OnboardingDeps> = {}): OnboardingDeps & { lines: string[]; writePassword: ReturnType<typeof vi.fn> } {
  const lines: string[] = [];
  return {
    keystorePath: '/secure/keystore.json',
    account: 'default',
    backendUrl: 'http://localhost:3001',
    frontendUrl: 'http://localhost:5173',
    readKeystoreFile: vi.fn(async () => keystoreJson),
    promptPassword: vi.fn(async () => PASSWORD),
    writePassword: vi.fn(async () => {}),
    output: (l: string) => lines.push(l),
    lines,
    ...over,
  } as never;
}

describe('performOnboarding (verify-before-store)', () => {
  it('verifiziert das Passwort gegen den Keystore, schreibt dann den Keychain und gibt Adresse + Config aus', async () => {
    const d = deps();
    await performOnboarding(d);
    expect(d.writePassword).toHaveBeenCalledWith('default', PASSWORD);
    const out = d.lines.join('\n');
    expect(out).toContain(ADDRESS);
    expect(out).toMatch(/claude_desktop_config|mcpServers/);
  });

  it('FALSCHES Passwort → KEIN Keychain-Write (fail-fast)', async () => {
    const d = deps({ promptPassword: vi.fn(async () => 'wrong') });
    await expect(performOnboarding(d)).rejects.toThrow(/entschlüsselt|nichts/i);
    expect(d.writePassword).not.toHaveBeenCalled();
  });

  it('fehlende Keystore-Datei → kein Write, klarer Fehler', async () => {
    const d = deps({ readKeystoreFile: vi.fn(async () => { throw new Error('ENOENT'); }) });
    await expect(performOnboarding(d)).rejects.toThrow(/lesbar|Keystore/i);
    expect(d.writePassword).not.toHaveBeenCalled();
  });

  it('leakt weder Passwort noch Private Key in der Ausgabe', async () => {
    const d = deps();
    await performOnboarding(d);
    const out = d.lines.join('\n');
    expect(out).not.toContain(PASSWORD);
    expect(out).not.toContain(PRIVATE_KEY);
    expect(out).not.toContain(PRIVATE_KEY.slice(2));
  });
});
