import { TriggerStatusService } from './trigger-status.service';

describe('TriggerStatusService', () => {
  let service: TriggerStatusService;

  beforeEach(() => {
    service = new TriggerStatusService(
      { get: jest.fn().mockReturnValue('http://localhost:8545') } as any,
      {
        stepType: {
          findMany: jest.fn().mockResolvedValue([
            { name: 'Interval Condition', contractAddress: '0xinterval', selector: '0xd89f1e36' },
            { name: 'Timer Condition', contractAddress: '0xtimer', selector: '0xd89f1e36' },
            { name: 'Token Balance Condition', contractAddress: '0xbalance', selector: '0xd89f1e36' },
          ]),
        },
      } as any,
    );
  });

  describe('formatDuration', () => {
    it('formats seconds', () => {
      expect((service as any).formatDuration(45)).toBe('45s');
    });

    it('formats minutes', () => {
      expect((service as any).formatDuration(120)).toBe('2m');
    });

    it('formats hours and minutes', () => {
      expect((service as any).formatDuration(3720)).toBe('1h 2m');
    });

    it('formats hours only', () => {
      expect((service as any).formatDuration(7200)).toBe('2h');
    });
  });

  describe('interpretInterval', () => {
    const { AbiCoder } = require('ethers');
    const coder = AbiCoder.defaultAbiCoder();

    it('returns "Not initialized" when slot is empty', () => {
      const data = coder.encode(['uint256', 'uint32'], [86400, 0]);
      const result = (service as any).interpretInterval(data, []);
      expect(result.description).toBe('Not initialized');
    });

    it('returns "Ready to fire" when time has passed', () => {
      const data = coder.encode(['uint256', 'uint32'], [86400, 0]);
      const pastTimestamp = Math.floor(Date.now() / 1000) - 100;
      const ctxValue = coder.encode(['uint256'], [pastTimestamp]);
      const result = (service as any).interpretInterval(data, [ctxValue]);
      expect(result.met).toBe(true);
      expect(result.description).toBe('Ready to fire');
    });

    it('returns countdown when time is in the future', () => {
      const data = coder.encode(['uint256', 'uint32'], [86400, 0]);
      const futureTimestamp = Math.floor(Date.now() / 1000) + 7200;
      const ctxValue = coder.encode(['uint256'], [futureTimestamp]);
      const result = (service as any).interpretInterval(data, [ctxValue]);
      expect(result.met).toBe(false);
      expect(result.description).toMatch(/Fires in/);
      expect(result.nextFireAt).toBeTruthy();
    });
  });

  describe('interpretTimer', () => {
    const { AbiCoder } = require('ethers');
    const coder = AbiCoder.defaultAbiCoder();

    it('returns "Stopped" when start time is 0', () => {
      const data = coder.encode(['uint256', 'uint32'], [3600, 0]);
      const ctxValue = coder.encode(['uint256'], [0]);
      const result = (service as any).interpretTimer(data, [ctxValue]);
      expect(result.description).toBe('Stopped');
    });

    it('returns "Ready to fire" when timer has elapsed', () => {
      const data = coder.encode(['uint256', 'uint32'], [100, 0]);
      const pastStart = Math.floor(Date.now() / 1000) - 200;
      const ctxValue = coder.encode(['uint256'], [pastStart]);
      const result = (service as any).interpretTimer(data, [ctxValue]);
      expect(result.met).toBe(true);
      expect(result.description).toBe('Ready to fire');
    });

    it('returns "Stopped" when slot is empty', () => {
      const data = coder.encode(['uint256', 'uint32'], [3600, 0]);
      const result = (service as any).interpretTimer(data, []);
      expect(result.description).toBe('Stopped');
    });
  });
});
