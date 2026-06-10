import { describe, it, expect, beforeAll } from 'vitest';
import { inspect } from 'node:util';
import { encryptKeystoreJsonSync, verifyMessage } from 'ethers';
import { WalletSigner } from './wallet-signer.js';

// Hardhat test account #0 — deterministisch, niemals echtes Vermögen.
const PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const PASSWORD = 'correct horse battery staple';

let keystoreJson: string;

beforeAll(() => {
  // Niedriges scrypt-N nur für schnelle, deterministische Test-Fixtures.
  keystoreJson = encryptKeystoreJsonSync(
    { address: ADDRESS, privateKey: PRIVATE_KEY },
    PASSWORD,
    { scrypt: { N: 1 << 8 } },
  );
});

describe('WalletSigner', () => {
  it('leitet die korrekte Owner-Adresse aus Keystore + Passwort ab', async () => {
    const signer = await WalletSigner.fromKeystore(keystoreJson, PASSWORD);
    expect(signer.address).toBe(ADDRESS);
  });

  it('signiert eine Nachricht recoverbar zur Owner-Adresse (EIP-191)', async () => {
    const signer = await WalletSigner.fromKeystore(keystoreJson, PASSWORD);
    const message = 'pecunity siwe handshake';
    const signature = await signer.signMessage(message);
    expect(verifyMessage(message, signature)).toBe(ADDRESS);
  });

  it('wirft bei falschem Passwort einen sicheren Fehler ohne Key-/Passwort-Fragmente', async () => {
    let caught: unknown;
    try {
      await WalletSigner.fromKeystore(keystoreJson, 'wrong password');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    const text = (caught as Error).message + '\n' + ((caught as Error).stack ?? '');
    expect(text).not.toContain(PRIVATE_KEY);
    expect(text).not.toContain('wrong password');
    expect(text.toLowerCase()).not.toContain('private');
  });

  it('leakt weder Private Key noch Passwort über Serialisierung/Inspect', async () => {
    const signer = await WalletSigner.fromKeystore(keystoreJson, PASSWORD);
    const serialized = JSON.stringify(signer) ?? '';
    const inspected = inspect(signer, { depth: 5 });
    const stringified = String(signer);
    for (const view of [serialized, inspected, stringified]) {
      expect(view).not.toContain(PRIVATE_KEY);
      // ohne 0x-Prefix
      expect(view).not.toContain(PRIVATE_KEY.slice(2));
      expect(view).not.toContain(PASSWORD);
    }
  });
});
