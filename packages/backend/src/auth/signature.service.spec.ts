import { SignatureService } from './signature.service';
import { Wallet } from 'ethers';
import { SiweMessage } from 'siwe';

describe('SignatureService', () => {
  const service = new SignatureService();
  const wallet = new Wallet(
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  );
  const domain = 'localhost';
  const nonce = 'abcdef1234567890';

  async function createSignedMessage() {
    const message = new SiweMessage({
      domain,
      address: wallet.address,
      statement: 'Sign in to Pecunity',
      uri: `http://${domain}`,
      version: '1',
      chainId: 56,
      nonce,
      issuedAt: new Date().toISOString(),
    });
    const messageString = message.prepareMessage();
    const signature = await wallet.signMessage(messageString);
    return { messageString, signature };
  }

  it('recovers the correct address from a valid EOA signature', async () => {
    const { messageString, signature } = await createSignedMessage();
    const result = await service.verify(
      messageString,
      signature,
      domain,
      nonce,
    );
    expect(result.success).toBe(true);
    expect(result.address?.toLowerCase()).toBe(
      wallet.address.toLowerCase(),
    );
  });

  it('rejects an invalid signature', async () => {
    const { messageString } = await createSignedMessage();
    const badSignature =
      '0x' + 'ab'.repeat(64) + '1b';
    const result = await service.verify(
      messageString,
      badSignature,
      domain,
      nonce,
    );
    expect(result.success).toBe(false);
  });

  it('rejects when domain does not match', async () => {
    const { messageString, signature } = await createSignedMessage();
    const result = await service.verify(
      messageString,
      signature,
      'evil.com',
      nonce,
    );
    expect(result.success).toBe(false);
  });

  it('rejects when nonce does not match', async () => {
    const { messageString, signature } = await createSignedMessage();
    const result = await service.verify(
      messageString,
      signature,
      domain,
      'wrongnonce12345678',
    );
    expect(result.success).toBe(false);
  });
});
