import { SiweMessage } from 'siwe';

/** Minimaler Signer-Kontrakt — von `WalletSigner` erfüllt, im Test stubbar. */
export interface MessageSigner {
  readonly address: `0x${string}`;
  signMessage(message: string): Promise<string>;
}

export interface AuthClientConfig {
  /** Basis-URL des Pecunity-Backends (ohne trailing slash nötig). */
  backendUrl: string;
  /** Frontend-URL; ihr Host wird als SIWE-`domain` verwendet (Backend prüft gegen `FRONTEND_URL`). */
  frontendUrl: string;
  /** Chain-ID (BSC mainnet = 56). */
  chainId: number;
  signer: MessageSigner;
  /** Injizierbar für Tests; default global `fetch`. */
  fetchFn?: typeof fetch;
  statement?: string;
}

const DEFAULT_STATEMENT =
  'Pecunity MCP server signs in to manage the vaults of this wallet.';

/**
 * Server-seitiger SIWE-Handshake gegen das bestehende Backend
 * (`/auth/nonce` → `/auth/verify` → `/auth/refresh`).
 *
 * Deep module: kapselt Nonce-Abruf, SIWE-Bau, Signatur und Token-Haltung.
 * Tokens sind #private und werden über `toJSON`/`inspect`/`toString` nicht geleakt.
 */
export class AuthClient {
  readonly #cfg: Required<Omit<AuthClientConfig, 'statement'>> & { statement: string };
  readonly #domain: string;
  #accessToken?: string;
  #refreshToken?: string;

  constructor(cfg: AuthClientConfig) {
    this.#cfg = {
      backendUrl: cfg.backendUrl.replace(/\/+$/, ''),
      frontendUrl: cfg.frontendUrl,
      chainId: cfg.chainId,
      signer: cfg.signer,
      fetchFn: cfg.fetchFn ?? fetch,
      statement: cfg.statement ?? DEFAULT_STATEMENT,
    };
    this.#domain = new URL(cfg.frontendUrl).host;
  }

  get accessToken(): string | undefined {
    return this.#accessToken;
  }

  authHeader(): { Authorization: string } {
    if (!this.#accessToken) {
      throw new Error('Nicht authentifiziert — zuerst authenticate() aufrufen.');
    }
    return { Authorization: `Bearer ${this.#accessToken}` };
  }

  /** Voller Handshake: nonce → SIWE bauen+signieren → verify → Tokens speichern. */
  async authenticate(): Promise<void> {
    const { nonce } = await this.#getJson<{ nonce: string }>('GET', '/auth/nonce');
    const message = this.#buildSiweMessage(nonce);
    const signature = await this.#cfg.signer.signMessage(message);
    const tokens = await this.#getJson<{ accessToken: string; refreshToken: string }>(
      'POST',
      '/auth/verify',
      { message, signature },
    );
    this.#accessToken = tokens.accessToken;
    this.#refreshToken = tokens.refreshToken;
  }

  /** Erneuert den Access-Token über den gespeicherten Refresh-Token. */
  async refresh(): Promise<void> {
    if (!this.#refreshToken) {
      throw new Error('Kein Refresh-Token vorhanden — zuerst authenticate() aufrufen.');
    }
    const { accessToken } = await this.#getJson<{ accessToken: string }>(
      'POST',
      '/auth/refresh',
      { refreshToken: this.#refreshToken },
    );
    this.#accessToken = accessToken;
  }

  #buildSiweMessage(nonce: string): string {
    const siwe = new SiweMessage({
      domain: this.#domain,
      address: this.#cfg.signer.address,
      statement: this.#cfg.statement,
      uri: this.#cfg.frontendUrl,
      version: '1',
      chainId: this.#cfg.chainId,
      nonce,
      issuedAt: new Date().toISOString(),
    });
    return siwe.prepareMessage();
  }

  async #getJson<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<T> {
    let res: Response;
    try {
      res = await this.#cfg.fetchFn(`${this.#cfg.backendUrl}${path}`, {
        method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new Error(`Backend nicht erreichbar (${path}).`);
    }
    if (!res.ok) {
      // Status, aber kein Response-Echo, das Signatur/Message zurückspiegeln könnte.
      throw new Error(`Authentifizierung fehlgeschlagen (${path}: HTTP ${res.status}).`);
    }
    return (await res.json()) as T;
  }

  toJSON(): { authenticated: boolean; address: `0x${string}` } {
    return { authenticated: this.#accessToken !== undefined, address: this.#cfg.signer.address };
  }

  toString(): string {
    return '[AuthClient: redacted]';
  }

  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return '[AuthClient: redacted]';
  }
}
