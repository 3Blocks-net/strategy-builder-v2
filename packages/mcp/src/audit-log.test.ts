import { describe, it, expect, vi } from 'vitest';
import { AuditLog } from './audit-log.js';

describe('AuditLog', () => {
  it('schreibt eine append-only JSON-Zeile mit Zeitstempel + Feldern', async () => {
    const lines: string[] = [];
    const log = new AuditLog({
      append: async (line) => void lines.push(line),
      clock: () => '2026-06-11T00:00:00.000Z',
    });

    await log.record({
      tool: 'create_vault',
      params: { depositToken: '0xtok', label: 'Main' },
      summary: 'Create vault with deposit token 0xtok',
      outcome: 'success',
      txHash: '0xabc',
    });

    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry).toEqual({
      timestamp: '2026-06-11T00:00:00.000Z',
      tool: 'create_vault',
      params: { depositToken: '0xtok', label: 'Main' },
      summary: 'Create vault with deposit token 0xtok',
      outcome: 'success',
      txHash: '0xabc',
    });
  });

  it('hängt mehrere Einträge an (append-only, eine Zeile je record)', async () => {
    const append = vi.fn(async () => {});
    const log = new AuditLog({ append });
    await log.record({ tool: 'a', params: {}, outcome: 'requested' });
    await log.record({ tool: 'b', params: {}, outcome: 'denied' });
    expect(append).toHaveBeenCalledTimes(2);
    expect(String(append.mock.calls[0][0])).toContain('"tool":"a"');
    expect(String(append.mock.calls[1][0])).toContain('"outcome":"denied"');
  });
});
