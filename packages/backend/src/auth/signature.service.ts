import { Injectable } from '@nestjs/common';
import { SiweMessage } from 'siwe';

export interface SiweVerifyResult {
  success: boolean;
  address?: string;
  error?: string;
}

@Injectable()
export class SignatureService {
  async verify(
    message: string,
    signature: string,
    expectedDomain: string,
    expectedNonce: string,
  ): Promise<SiweVerifyResult> {
    try {
      const siweMessage = new SiweMessage(message);
      const result = await siweMessage.verify(
        { signature, domain: expectedDomain, nonce: expectedNonce },
        { suppressExceptions: true },
      );

      if (!result.success) {
        return { success: false, error: result.error?.type ?? 'Unknown error' };
      }

      return { success: true, address: result.data.address };
    } catch {
      return { success: false, error: 'Failed to parse SIWE message' };
    }
  }

  parse(message: string): SiweMessage {
    return new SiweMessage(message);
  }
}
