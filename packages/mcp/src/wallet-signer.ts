import { Wallet, Contract, JsonRpcProvider, type HDNodeWallet, type InterfaceAbi } from 'ethers';

export interface ContractTxRequest {
  rpcUrl: string;
  address: string;
  abi: InterfaceAbi;
  functionName: string;
  args: unknown[];
  gasLimit?: bigint;
}

export interface RawTxRequest {
  rpcUrl: string;
  to: string;
  data: string;
  gasLimit?: bigint;
}

export interface ContractTxReceipt {
  hash: string;
  blockNumber: number;
  logs: readonly { topics: readonly string[]; data: string; address: string }[];
}

declare const TRUSTED: unique symbol;
/** Nominal „server-seitig vertrauenswürdig"-Markierung (kein Runtime-Effekt). */
export type Trusted<T> = T & { readonly [TRUSTED]: true };

/**
 * Markiert eine TX-Anfrage als vertrauenswürdig (nur aus server-seitiger Quelle
 * aufrufen — NIE mit LLM-/User-kontrollierten `to`/`data`/`functionName`/`args`).
 * Macht „ich signiere hier etwas" zu einer expliziten, grep-baren Stelle: der
 * Signer akzeptiert ohne diese Markierung nichts (Compile-Fehler).
 */
export function trustTx<T extends ContractTxRequest | RawTxRequest>(req: T): Trusted<T> {
  return req as Trusted<T>;
}

const REDACTED = '[WalletSigner: redacted]';

/**
 * Kapselt den Wallet-Zugang (verschlüsselter JSON-Keystore).
 *
 * Deep module: die Schnittstelle ist klein (Adresse ableiten, Nachricht/TX
 * signieren), die gesamte Key-Behandlung liegt dahinter. Key-Material wird
 * niemals nach außen gereicht und nie geloggt — `toJSON`/`inspect`/`toString`
 * sind bewusst redigiert.
 */
export class WalletSigner {
  // #private: weder von JSON.stringify noch von util.inspect sichtbar.
  readonly #wallet: HDNodeWallet | Wallet;
  readonly #address: `0x${string}`;

  private constructor(wallet: HDNodeWallet | Wallet) {
    this.#wallet = wallet;
    this.#address = wallet.address as `0x${string}`;
  }

  /**
   * Entschlüsselt einen Web3-Secret-Storage-Keystore und leitet die
   * Owner-Adresse ab. Wirft bei falschem Passwort / beschädigtem Keystore
   * einen sicheren Fehler ohne Key- oder Passwort-Fragmente.
   */
  static async fromKeystore(
    keystoreJson: string,
    password: string,
  ): Promise<WalletSigner> {
    let wallet: HDNodeWallet | Wallet;
    try {
      wallet = await Wallet.fromEncryptedJson(keystoreJson, password);
    } catch {
      // Bewusst kein `cause` und keine Original-Message weiterreichen —
      // sie könnte Argument-Fragmente enthalten.
      throw new Error(
        'Wallet-Zugang konnte nicht entschlüsselt werden (falsches Passwort oder beschädigter Keystore).',
      );
    }
    return new WalletSigner(wallet);
  }

  get address(): `0x${string}` {
    return this.#address;
  }

  /** EIP-191 personal_sign über die kanonische Nachricht (z. B. SIWE). */
  async signMessage(message: string): Promise<string> {
    return this.#wallet.signMessage(message);
  }

  /**
   * Signiert + sendet eine Contract-Transaktion und wartet auf den Receipt.
   * Der Key bleibt im Signer; bei Revert (status 0) wird hart geworfen.
   *
   * SICHERHEIT: `address`, `functionName` und `args` dürfen NIEMALS direkt aus
   * LLM-/User-Input stammen — sonst lässt sich ein beliebiger Contract-Call im
   * Namen des Owners signieren. Aufrufer müssen sie aus vertrauenswürdiger,
   * server-seitiger Quelle setzen (z. B. fixe Factory-ABI in chain.ts).
   */
  async sendContractTransaction(req: Trusted<ContractTxRequest>): Promise<ContractTxReceipt> {
    const provider = new JsonRpcProvider(req.rpcUrl);
    const wallet = this.#wallet.connect(provider);
    const contract = new Contract(req.address, req.abi, wallet);
    const tx = await contract.getFunction(req.functionName)(
      ...req.args,
      req.gasLimit !== undefined ? { gasLimit: req.gasLimit } : {},
    );
    const receipt = await tx.wait();
    if (!receipt || receipt.status === 0) {
      throw new Error('Transaktion fehlgeschlagen (revert).');
    }
    return {
      hash: receipt.hash,
      blockNumber: receipt.blockNumber,
      logs: receipt.logs as ContractTxReceipt['logs'],
    };
  }

  /**
   * Signiert + sendet eine **rohe** Transaktion (to + data) und wartet auf den
   * Receipt. Für vorab encodete Calldata (z. B. Automation-Deploy an den Vault).
   * Gleiche Sicherheitsregel wie sendContractTransaction: `to`/`data` nie direkt
   * aus LLM-Input — nur aus vertrauenswürdiger, server-seitig encodeter Quelle.
   */
  async sendRawTransaction(req: Trusted<RawTxRequest>): Promise<ContractTxReceipt> {
    const provider = new JsonRpcProvider(req.rpcUrl);
    const wallet = this.#wallet.connect(provider);
    const tx = await wallet.sendTransaction({
      to: req.to,
      data: req.data,
      ...(req.gasLimit !== undefined ? { gasLimit: req.gasLimit } : {}),
    });
    const receipt = await tx.wait();
    if (!receipt || receipt.status === 0) {
      throw new Error('Transaktion fehlgeschlagen (revert).');
    }
    return {
      hash: receipt.hash,
      blockNumber: receipt.blockNumber,
      logs: receipt.logs as ContractTxReceipt['logs'],
    };
  }

  toJSON(): { address: `0x${string}` } {
    // Nur die öffentliche Adresse, niemals Key-Material.
    return { address: this.#address };
  }

  toString(): string {
    return REDACTED;
  }

  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return REDACTED;
  }
}
