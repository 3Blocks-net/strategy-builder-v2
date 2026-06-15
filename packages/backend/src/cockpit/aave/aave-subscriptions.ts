/**
 * Pure Aave V3 log-subscription descriptors (Vault-Cockpit slice #08/#09).
 *
 * Extracted from the adapter so the conformance suite can validate the shape
 * without resolving the pool over RPC. Supply(onBehalfOf) / Withdraw(user) — both
 * carry the vault at indexed topic 2.
 */
import { Interface, getAddress } from 'ethers';
import type { LogSubscription } from '../../indexer/protocol-flow';

export function buildAaveLogSubscriptions(pool: string): LogSubscription[] {
  const iface = new Interface([
    'event Supply(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint16 indexed referralCode)',
    'event Withdraw(address indexed reserve, address indexed user, address indexed to, uint256 amount)',
  ]);
  const address = getAddress(pool);
  return [
    {
      address,
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
    },
    {
      address,
      iface,
      eventName: 'Withdraw',
      topic0: iface.getEvent('Withdraw')!.topicHash,
      vaultTopicIndex: 2, // user
      toDraft: (a: any) => ({
        protocol: 'aave-v3',
        kind: 'AAVE_WITHDRAW',
        token: getAddress(a.reserve),
        amount: a.amount.toString(),
      }),
    },
  ];
}
