/** Was der BackendClient vom AuthClient braucht (im Test stubbar). */
export interface AuthLike {
  authHeader(): { Authorization: string };
  refresh(): Promise<void>;
}

/** Backend lehnt den Zugriff auf einen fremden Vault ab (owner-guarded → 403). */
export class ForbiddenVaultError extends Error {
  constructor(address: string) {
    super(`Zugriff verweigert: Vault ${address} gehört nicht zur verbundenen Adresse.`);
    this.name = 'ForbiddenVaultError';
  }
}

function extractAddress(path: string): string {
  return path.match(/0x[0-9a-fA-F]{40}/)?.[0] ?? path;
}

/**
 * Authentifizierter Lese-Client für die bestehenden owner-guarded Backend-
 * Endpunkte. Hängt das Session-JWT an, erneuert es einmalig bei 401 und
 * übersetzt 403 in einen klaren Owner-Isolation-Fehler (kein Daten-Leak).
 */
export class BackendClient {
  readonly #backendUrl: string;
  readonly #auth: AuthLike;
  readonly #fetchFn: typeof fetch;

  constructor(cfg: { backendUrl: string; auth: AuthLike; fetchFn?: typeof fetch }) {
    this.#backendUrl = cfg.backendUrl.replace(/\/+$/, '');
    this.#auth = cfg.auth;
    this.#fetchFn = cfg.fetchFn ?? fetch;
  }

  async get<T>(path: string): Promise<T> {
    let res = await this.#request(path);
    if (res.status === 401) {
      // Token abgelaufen → einmal erneuern und wiederholen.
      await this.#auth.refresh();
      res = await this.#request(path);
    }
    if (res.status === 403) {
      throw new ForbiddenVaultError(extractAddress(path));
    }
    if (!res.ok) {
      throw new Error(`Backend-Abfrage fehlgeschlagen (${path}: HTTP ${res.status}).`);
    }
    return (await res.json()) as T;
  }

  #request(path: string): Promise<Response> {
    return this.#fetchFn(`${this.#backendUrl}${path}`, {
      method: 'GET',
      headers: { ...this.#auth.authHeader() },
    });
  }
}
