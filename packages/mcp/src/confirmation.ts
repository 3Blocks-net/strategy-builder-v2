import { createServer, type Server as HttpServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import type { ConfirmationProvider, ConfirmationRequest } from './policy-gate.js';

// --- MCP-Elicitation (primärer Pfad) ----------------------------------------

interface ElicitResultLike {
  action: 'accept' | 'decline' | 'cancel';
  content?: Record<string, unknown>;
}

interface ElicitCapable {
  elicitInput(
    params: unknown,
    options?: { timeout?: number },
  ): Promise<ElicitResultLike>;
}

/**
 * Primärer Confirm-Pfad: fragt den Client per MCP-Elicitation. `accept` mit
 * `confirm: true` = Freigabe; alles andere = Ablehnung. Wirft der Client (Timeout
 * / nicht unterstützt), propagiert der Fehler → das Gate behandelt das als hartes
 * Fail (kein stilles Signieren).
 */
export class ElicitationConfirmationProvider implements ConfirmationProvider {
  constructor(
    private readonly server: ElicitCapable,
    private readonly timeoutMs = 120_000,
  ) {}

  async requestApproval(req: ConfirmationRequest): Promise<boolean> {
    const result = await this.server.elicitInput(
      {
        message:
          `${req.summary}\n\nDiese Aktion signiert in deinem Namen. Bestätigen, um fortzufahren.`,
        requestedSchema: {
          type: 'object',
          properties: {
            confirm: { type: 'boolean', title: 'Bestätigen', description: 'Aktion freigeben' },
          },
          required: ['confirm'],
        },
      },
      { timeout: this.timeoutMs },
    );
    return result.action === 'accept' && result.content?.confirm === true;
  }
}

// --- Lokale Bestätigungsseite (Fallback) ------------------------------------

/**
 * Registry server-interner, einmaliger Approval-Token. Die Freigabe ist ein
 * server-interner Zustand: nur wer den (pro Aktion zufällig erzeugten) Token
 * besitzt und ihn einlöst, gibt frei. Das LLM sieht den Token nie und kann ihn
 * nicht fälschen.
 */
export class PendingApprovals {
  readonly #pending = new Map<string, (approved: boolean) => void>();

  create(): { token: string; promise: Promise<boolean> } {
    const token = randomBytes(32).toString('hex');
    let resolve!: (approved: boolean) => void;
    const promise = new Promise<boolean>((r) => {
      resolve = r;
    });
    this.#pending.set(token, resolve);
    return { token, promise };
  }

  /** Löst einen Token ein (einmalig). Unbekannter/benutzter Token → false. */
  redeem(token: string, approved: boolean): boolean {
    const resolve = this.#pending.get(token);
    if (!resolve) return false;
    this.#pending.delete(token);
    resolve(approved);
    return true;
  }

  cancel(token: string): void {
    this.#pending.delete(token);
  }
}

function openBrowser(url: string): void {
  const cmd =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  try {
    spawn(cmd, [url], { stdio: 'ignore', detached: true }).unref();
  } catch {
    // best-effort; die URL steht ohnehin auf stderr.
  }
}

/**
 * Fallback-Confirm über eine **lokale Bestätigungsseite** (localhost), deren Summary
 * direkt vom Server-Prozess kommt. Die Freigabe läuft über einen einmaligen Token
 * (siehe {@link PendingApprovals}); Timeout = hartes Fail (rejectet).
 */
export class LocalhostConfirmationProvider implements ConfirmationProvider {
  readonly #pending = new PendingApprovals();
  readonly #summaries = new Map<string, string>();
  #server?: HttpServer;
  #startingUp?: Promise<void>;
  #port = 0;

  constructor(private readonly timeoutMs = 120_000) {}

  async requestApproval(req: ConfirmationRequest): Promise<boolean> {
    await this.#ensureServer();
    const { token, promise } = this.#pending.create();
    const url = `http://127.0.0.1:${this.#port}/confirm/${token}`;

    this.#renderUrl(req, url);
    openBrowser(url);

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => {
        this.#pending.cancel(token);
        reject(new Error('confirmation timed out'));
      }, this.timeoutMs).unref(),
    );
    // Summary in eine Closure für die Seite legen.
    this.#summaries.set(token, req.summary);
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      this.#summaries.delete(token);
    }
  }

  #renderUrl(req: ConfirmationRequest, url: string): void {
    // SICHERHEIT: Die URL enthält den einmaligen Approval-Token. Sie geht bewusst
    // nur auf stderr (nicht stdout = MCP-Kanal) und darf NIE in ein LLM-sichtbares
    // Channel geroutet werden — sonst könnte das LLM den /approve-Pfad selbst aufrufen.
    process.stderr.write(
      `\n[pecunity-mcp] Bestätigung nötig für "${req.tool}":\n  ${req.summary}\n  Öffne zum Freigeben/Ablehnen: ${url}\n`,
    );
  }

  #ensureServer(): Promise<void> {
    if (this.#server) return Promise.resolve();
    if (this.#startingUp) return this.#startingUp;
    this.#startingUp = new Promise<void>((resolve, reject) => {
      const srv = createServer((req, res) => this.#handleRequest(req, res));
      srv.once('error', (err) => {
        this.#startingUp = undefined;
        reject(err);
      });
      srv.listen(0, '127.0.0.1', () => {
        srv.removeAllListeners('error');
        const addr = srv.address();
        this.#port = typeof addr === 'object' && addr ? addr.port : 0;
        this.#server = srv;
        this.#startingUp = undefined;
        resolve();
      });
    });
    return this.#startingUp;
  }

  #handleRequest(
    httpReq: { url?: string; method?: string; headers?: { host?: string } },
    httpRes: import('node:http').ServerResponse,
  ): void {
    // SICHERHEIT (DNS-Rebinding): nur Anfragen mit loopback-Host akzeptieren. Ein
    // fremder Host-Header bedeutet, dass eine Webseite den Port über einen rebound
    // Hostnamen anspricht — abweisen, bevor irgendein Token eingelöst werden kann.
    const host = httpReq.headers?.host;
    if (host !== undefined) {
      const hostname = host.replace(/:\d+$/, '');
      if (hostname !== '127.0.0.1' && hostname !== 'localhost') {
        httpRes.writeHead(403).end('Forbidden');
        return;
      }
    }
    const match = /^\/confirm\/([0-9a-f]{64})(?:\/(approve|deny))?$/.exec(httpReq.url ?? '');
    if (!match) {
      httpRes.writeHead(404).end('Not found');
      return;
    }
    const [, token, decision] = match;
    const summary = this.#summaries.get(token) ?? '(keine Zusammenfassung)';
    if (decision) {
      // Freigeben/Ablehnen nur per POST — passive Navigation (img/prefetch) kann
      // so nicht freigeben.
      if (httpReq.method !== 'POST') {
        httpRes.writeHead(405, { Allow: 'POST' }).end('Method Not Allowed');
        return;
      }
      const ok = this.#pending.redeem(token, decision === 'approve');
      httpRes.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(
        `<h2>${ok ? (decision === 'approve' ? '✓ Freigegeben' : '✗ Abgelehnt') : 'Token ungültig oder bereits benutzt'}</h2><p>Du kannst dieses Fenster schließen.</p>`,
      );
      return;
    }
    httpRes.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(
      `<h2>Pecunity — Aktion bestätigen</h2><pre>${escapeHtml(summary)}</pre>
       <p>Diese Aktion signiert in deinem Namen.</p>
       <form method="POST" action="/confirm/${token}/approve" style="display:inline"><button type="submit">Freigeben</button></form>
       <form method="POST" action="/confirm/${token}/deny" style="display:inline"><button type="submit">Ablehnen</button></form>`,
    );
  }

  close(): void {
    this.#server?.close();
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/**
 * Versucht zuerst MCP-Elicitation; schlägt sie fehl, weil der Client sie **nicht
 * unterstützt**, weicht sie auf die lokale Seite aus. Ein **Timeout** der
 * Elicitation ist hingegen ein hartes Fail (kein Fallback) — dann ist der Nutzer
 * erreichbar, aber untätig.
 */
export class CompositeConfirmationProvider implements ConfirmationProvider {
  constructor(
    private readonly primary: ConfirmationProvider,
    private readonly fallback: ConfirmationProvider,
    private readonly isUnsupported: (err: unknown) => boolean,
  ) {}

  async requestApproval(req: ConfirmationRequest): Promise<boolean> {
    try {
      return await this.primary.requestApproval(req);
    } catch (err) {
      if (this.isUnsupported(err)) {
        return this.fallback.requestApproval(req);
      }
      throw err;
    }
  }
}
