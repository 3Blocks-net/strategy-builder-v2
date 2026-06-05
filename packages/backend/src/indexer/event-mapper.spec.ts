import { getAddress } from 'ethers';
import {
  vaultEventInterface,
  parseVaultLog,
  buildExecutionRows,
  buildVaultEventRows,
  ParsedVaultLog,
} from './event-mapper';

const VAULT = getAddress('0x1111111111111111111111111111111111111111');
const EXECUTOR = getAddress('0x2222222222222222222222222222222222222222');
const TOKEN = getAddress('0x55d398326f99059fF775485246999027B3197955'); // BSC USDT

/** Encode a real log from args so the test exercises parseLog end-to-end. */
function encodeLog(
  name: string,
  args: any[],
  over: { txHash: string; blockNumber: number; index: number },
) {
  const ev = vaultEventInterface.getEvent(name)!;
  const { data, topics } = vaultEventInterface.encodeEventLog(ev, args);
  return {
    address: VAULT,
    transactionHash: over.txHash,
    blockNumber: over.blockNumber,
    index: over.index,
    topics,
    data,
  };
}

describe('event-mapper', () => {
  describe('parseVaultLog', () => {
    it('decodes an AutomationExecuted log', () => {
      const log = encodeLog('AutomationExecuted', [3, EXECUTOR], {
        txHash: '0xaa',
        blockNumber: 10,
        index: 0,
      });
      const parsed = parseVaultLog(log)!;
      expect(parsed.name).toBe('AutomationExecuted');
      expect(Number(parsed.args[0])).toBe(3);
      expect(getAddress(parsed.args[1])).toBe(EXECUTOR);
      expect(parsed.logIndex).toBe(0);
      expect(parsed.address).toBe(VAULT);
    });

    it('returns null for a foreign (non-vault) log', () => {
      const log = {
        address: VAULT,
        transactionHash: '0xbb',
        blockNumber: 1,
        index: 0,
        topics: ['0x' + '12'.repeat(32)],
        data: '0x',
      };
      expect(parseVaultLog(log)).toBeNull();
    });
  });

  describe('buildExecutionRows', () => {
    const ts = new Map<number, number>([[10, 1_700_000_000]]);

    it('joins GasCompSettled in the same tx into gasCompAmount/gasCompToken', () => {
      const logs: ParsedVaultLog[] = [
        parseVaultLog(
          encodeLog('AutomationExecuted', [3, EXECUTOR], {
            txHash: '0xaa',
            blockNumber: 10,
            index: 1,
          }),
        )!,
        parseVaultLog(
          encodeLog('GasCompSettled', [3, EXECUTOR, TOKEN, 1234n], {
            txHash: '0xaa',
            blockNumber: 10,
            index: 2,
          }),
        )!,
      ];

      const rows = buildExecutionRows(logs, ts);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        automationId: 3,
        executorAddress: EXECUTOR,
        txHash: '0xaa',
        logIndex: 1,
        gasCompAmount: '1234',
        gasCompToken: TOKEN,
      });
      // timestamp conversion: unix seconds -> Date(ms)
      expect(rows[0].blockTimestamp.getTime()).toBe(1_700_000_000 * 1000);
    });

    it('leaves gas fields null for an owner run with no GasCompSettled', () => {
      const logs = [
        parseVaultLog(
          encodeLog('AutomationExecuted', [7, EXECUTOR], {
            txHash: '0xcc',
            blockNumber: 10,
            index: 0,
          }),
        )!,
      ];
      const rows = buildExecutionRows(logs, ts);
      expect(rows[0].gasCompAmount).toBeNull();
      expect(rows[0].gasCompToken).toBeNull();
    });

    it('does not cross-join GasCompSettled from a different tx', () => {
      const logs = [
        parseVaultLog(
          encodeLog('AutomationExecuted', [1, EXECUTOR], {
            txHash: '0xA',
            blockNumber: 10,
            index: 0,
          }),
        )!,
        parseVaultLog(
          encodeLog('GasCompSettled', [1, EXECUTOR, TOKEN, 9n], {
            txHash: '0xB', // different tx
            blockNumber: 10,
            index: 0,
          }),
        )!,
      ];
      const rows = buildExecutionRows(logs, ts);
      expect(rows).toHaveLength(1);
      expect(rows[0].gasCompAmount).toBeNull();
    });

    it('throws if a block timestamp is missing', () => {
      const logs = [
        parseVaultLog(
          encodeLog('AutomationExecuted', [1, EXECUTOR], {
            txHash: '0xA',
            blockNumber: 999,
            index: 0,
          }),
        )!,
      ];
      expect(() => buildExecutionRows(logs, ts)).toThrow(/timestamp/i);
    });
  });

  describe('buildVaultEventRows', () => {
    const ts = new Map<number, number>([[10, 1_700_000_000]]);

    it('derives the deposit fee from depositFeeBps (gross amount)', () => {
      const logs = [
        parseVaultLog(
          encodeLog('Deposited', [TOKEN, 1000n], { txHash: '0xd', blockNumber: 10, index: 0 }),
        )!,
      ];
      const rows = buildVaultEventRows(logs, ts, 100); // 1% deposit fee
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        eventType: 'DEPOSIT',
        token: TOKEN,
        amount: '1000',
        feeAmount: '10', // 1000 * 100 / 10_000
        feeBps: 100,
      });
    });

    it('takes the withdraw fee exactly from the event and derives bps', () => {
      const logs = [
        parseVaultLog(
          encodeLog('Withdrawn', [TOKEN, 1000n, 7n, EXECUTOR], { txHash: '0xw', blockNumber: 10, index: 0 }),
        )!,
      ];
      const rows = buildVaultEventRows(logs, ts, 100);
      expect(rows[0]).toMatchObject({
        eventType: 'WITHDRAW',
        token: TOKEN,
        amount: '1000',
        feeAmount: '7', // exact from the event
        feeBps: 70, // 7 * 10_000 / 1000
      });
    });

    it('ignores non deposit/withdraw logs', () => {
      const logs = [
        parseVaultLog(
          encodeLog('AutomationExecuted', [1, EXECUTOR], { txHash: '0xa', blockNumber: 10, index: 0 }),
        )!,
      ];
      expect(buildVaultEventRows(logs, ts, 100)).toHaveLength(0);
    });
  });
});
