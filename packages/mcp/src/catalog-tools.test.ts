import { describe, it, expect, vi } from 'vitest';
import { BackendClient, type AuthLike } from './backend-client.js';
import { listStepTypes, describeStepType } from './tools/catalog-tools.js';

const BACKEND = 'http://localhost:3000';
const ZERO = '0x0000000000000000000000000000000000000000';

function auth(): AuthLike {
  return { authHeader: () => ({ Authorization: 'Bearer t' }), refresh: vi.fn(async () => {}) };
}

function client(handler: (url: string) => Response) {
  const calls: string[] = [];
  const fetchFn = vi.fn(async (url: string | URL | Request) => {
    calls.push(String(url));
    return handler(String(url));
  }) as unknown as typeof fetch;
  return { bc: new BackendClient({ backendUrl: BACKEND, auth: auth(), fetchFn }), calls };
}

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });

const transferSchema = {
  type: 'object',
  properties: {
    token: { type: 'string', 'x-ui-widget': 'token-selector' },
    recipient: { type: 'string', 'x-ui-role': 'recipient' },
    amountFromSlot: { type: 'integer', 'x-ui-widget': 'context-slot', 'x-ui-slot-access': 'read' },
    amountToSlot: { type: 'integer', 'x-ui-widget': 'context-slot', 'x-ui-slot-access': 'write' },
  },
};

describe('listStepTypes', () => {
  it('listet nur deployte Steps (Null-Adressen ausgeschlossen), gemappt', async () => {
    const { bc } = client((u) =>
      u.endsWith('/step-types')
        ? json([
            { id: 's1', name: 'Interval', category: 'CONDITION', description: 'every N', contractAddress: '0xabc', selector: '0x1', paramSchema: {}, abiFragment: {} },
            { id: 's2', name: 'Undeployed', category: 'ACTION', description: 'n/a', contractAddress: ZERO, selector: '0x2', paramSchema: {}, abiFragment: {} },
          ])
        : json('nf', 404),
    );
    const list = await listStepTypes(bc);
    expect(list).toEqual([
      { id: 's1', name: 'Interval', category: 'CONDITION', description: 'every N' },
    ]);
  });

  it('leerer Katalog → []', async () => {
    const { bc } = client((u) => (u.endsWith('/step-types') ? json([]) : json('nf', 404)));
    await expect(listStepTypes(bc)).resolves.toEqual([]);
  });
});

describe('describeStepType', () => {
  it('liefert paramSchema JSON-Schema-treu + abgeleitete Kontext-Slots', async () => {
    const { bc } = client((u) =>
      u.endsWith('/step-types/s1')
        ? json({
            id: 's1',
            name: 'ERC-20 Transfer',
            category: 'ACTION',
            description: 'transfer',
            contractAddress: '0xabc',
            selector: '0xexec',
            paramSchema: transferSchema,
            abiFragment: { type: 'tuple', components: [{ name: 'token', type: 'address' }] },
          })
        : json('nf', 404),
    );
    const d = await describeStepType(bc, 's1');
    // paramSchema unverändert durchgereicht (schema-treu)
    expect(d.paramSchema).toEqual(transferSchema);
    expect(d.name).toBe('ERC-20 Transfer');
    expect(d.contextSlots).toEqual({ reads: ['amountFromSlot'], writes: ['amountToSlot'] });
  });
});
