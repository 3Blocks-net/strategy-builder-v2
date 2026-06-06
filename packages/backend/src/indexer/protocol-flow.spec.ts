import { Interface, getAddress } from 'ethers';
import {
  LogSubscription,
  buildProtocolFlowRows,
  vaultTopicFilter,
} from './protocol-flow';
import type { RawLogLike } from './event-mapper';

const POOL = getAddress('0x00000000000000000000000000000000000000aa');
const RESERVE = getAddress('0x1111111111111111111111111111111111111111');
const USER = getAddress('0x3333333333333333333333333333333333333333');
const VAULT = getAddress('0x2222222222222222222222222222222222222222');
const OTHER = getAddress('0x4444444444444444444444444444444444444444');

const iface = new Interface([
  'event Supply(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint16 indexed referralCode)',
]);

const sub: LogSubscription = {
  address: POOL,
  iface,
  eventName: 'Supply',
  topic0: iface.getEvent('Supply')!.topicHash,
  vaultTopicIndex: 2, // onBehalfOf
  toDraft: (a: any) => ({
    protocol: 'aave-v3',
    kind: 'AAVE_SUPPLY',
    token: getAddress(a.reserve),
    amount: a.amount.toString(),
  }),
};

function supplyLog(onBehalfOf: string, amount: bigint, over: Partial<RawLogLike> = {}): RawLogLike {
  const { data, topics } = iface.encodeEventLog(iface.getEvent('Supply')!, [
    RESERVE,
    USER,
    onBehalfOf,
    amount,
    0,
  ]);
  return {
    address: POOL,
    transactionHash: '0xtx',
    blockNumber: 10,
    index: 0,
    topics,
    data,
    ...over,
  };
}

describe('vaultTopicFilter', () => {
  it('places padded vault addresses at the vault topic index', () => {
    const topics = vaultTopicFilter(sub, [VAULT, OTHER]);
    expect(topics[0]).toBe(sub.topic0);
    expect(topics[1]).toBeNull(); // reserve slot
    expect(Array.isArray(topics[2])).toBe(true);
    expect((topics[2] as string[])[0]).toContain(VAULT.slice(2).toLowerCase());
  });
});

describe('buildProtocolFlowRows', () => {
  const ts = new Map([[10, 1_700_000_000]]);

  it('decodes a known-vault Supply into a frozen flow row', () => {
    const rows = buildProtocolFlowRows(
      sub,
      [supplyLog(VAULT, 1000n)],
      new Map([[VAULT, 'vid']]),
      ts,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      protocol: 'aave-v3',
      kind: 'AAVE_SUPPLY',
      token: RESERVE,
      amount: '1000',
      vaultAddress: VAULT,
      txHash: '0xtx',
      blockNumber: 10,
      logIndex: 0,
    });
    expect(rows[0].blockTimestamp).toEqual(new Date(1_700_000_000_000));
  });

  it('ignores a Supply for a foreign vault', () => {
    const rows = buildProtocolFlowRows(
      sub,
      [supplyLog(OTHER, 1000n)],
      new Map([[VAULT, 'vid']]),
      ts,
    );
    expect(rows).toHaveLength(0);
  });

  it('ignores logs whose topic0 does not match the subscription', () => {
    const rows = buildProtocolFlowRows(
      sub,
      [supplyLog(VAULT, 1000n, { topics: ['0xdeadbeef', '0x', '0x'] })],
      new Map([[VAULT, 'vid']]),
      ts,
    );
    expect(rows).toHaveLength(0);
  });
});
