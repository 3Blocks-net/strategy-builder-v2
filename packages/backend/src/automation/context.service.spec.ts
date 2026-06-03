import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ContextService } from './context.service';
import { PrismaService } from '../database/prisma.service';

describe('ContextService', () => {
  let service: ContextService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      vault: {
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContextService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('http://localhost:8545') },
        },
      ],
    }).compile();

    service = module.get<ContextService>(ContextService);
  });

  describe('allocateSlots', () => {
    it('allocates first slot at index 0 on a fresh vault', async () => {
      prisma.vault.findUniqueOrThrow.mockResolvedValue({
        id: 'v1',
        contextSlots: {},
      });
      prisma.vault.update.mockResolvedValue({});

      const result = await service.allocateSlots('v1', ['my-slot'], 'auto-1');

      expect(result).toEqual({ 'my-slot': 0 });
      expect(prisma.vault.update).toHaveBeenCalledWith({
        where: { id: 'v1' },
        data: {
          contextSlots: {
            '0': { name: 'my-slot', type: 'uint256', description: '', createdByAutomationId: 'auto-1' },
          },
        },
      });
    });

    it('allocates multiple slots sequentially', async () => {
      prisma.vault.findUniqueOrThrow.mockResolvedValue({
        id: 'v1',
        contextSlots: {},
      });
      prisma.vault.update.mockResolvedValue({});

      const result = await service.allocateSlots(
        'v1',
        ['slot-a', 'slot-b', 'slot-c'],
        'auto-1',
      );

      expect(result).toEqual({ 'slot-a': 0, 'slot-b': 1, 'slot-c': 2 });
    });

    it('adds to existing slots at the next index', async () => {
      prisma.vault.findUniqueOrThrow.mockResolvedValue({
        id: 'v1',
        contextSlots: {
          '0': { name: 'existing', createdByAutomationId: 'auto-0' },
        },
      });
      prisma.vault.update.mockResolvedValue({});

      const result = await service.allocateSlots('v1', ['new-slot'], 'auto-1');

      expect(result).toEqual({ 'new-slot': 1 });
    });

    it('returns the same index for an existing slot name (idempotent)', async () => {
      prisma.vault.findUniqueOrThrow.mockResolvedValue({
        id: 'v1',
        contextSlots: {
          '0': { name: 'my-slot', createdByAutomationId: 'auto-1' },
        },
      });
      prisma.vault.update.mockResolvedValue({});

      const result = await service.allocateSlots('v1', ['my-slot'], 'auto-2');

      expect(result).toEqual({ 'my-slot': 0 });
    });

    it('mixes existing and new slot names', async () => {
      prisma.vault.findUniqueOrThrow.mockResolvedValue({
        id: 'v1',
        contextSlots: {
          '0': { name: 'existing', createdByAutomationId: 'auto-0' },
        },
      });
      prisma.vault.update.mockResolvedValue({});

      const result = await service.allocateSlots(
        'v1',
        ['existing', 'brand-new'],
        'auto-1',
      );

      expect(result).toEqual({ existing: 0, 'brand-new': 1 });
    });
  });

  describe('buildExpandedContext', () => {
    it('returns empty array for no context', () => {
      const result = service.buildExpandedContext([], [], {});
      expect(result).toEqual([]);
    });

    it('preserves existing context with no changes', () => {
      const result = service.buildExpandedContext(
        ['0xaaa', '0xbbb'],
        [],
        undefined,
      );
      expect(result).toEqual(['0xaaa', '0xbbb']);
    });

    it('appends new slots with initial values', () => {
      const result = service.buildExpandedContext(
        ['0xaaa'],
        [{ index: 1, initialValue: '0xbbb' }],
        undefined,
      );
      expect(result).toEqual(['0xaaa', '0xbbb']);
    });

    it('appends new slots with default 0x when no initial value', () => {
      const result = service.buildExpandedContext(
        ['0xaaa'],
        [{ index: 2, initialValue: '0x' }],
        undefined,
      );
      expect(result).toEqual(['0xaaa', '0x', '0x']);
    });

    it('applies name-keyed overrides for existing slots (resolved via slotMapping)', () => {
      const result = service.buildExpandedContext(
        ['0xaaa', '0xbbb'],
        [],
        { slotA: '0xccc' },
        { slotA: 0 },
      );
      expect(result).toEqual(['0xccc', '0xbbb']);
    });

    it('handles new slots + name-keyed overrides together', () => {
      const result = service.buildExpandedContext(
        ['0xaaa', '0xbbb'],
        [{ index: 2, initialValue: '0xddd' }],
        { slotB: '0xccc' },
        { slotB: 1 },
      );
      expect(result).toEqual(['0xaaa', '0xccc', '0xddd']);
    });

    it('ignores overrides whose name is absent from the slotMapping', () => {
      const result = service.buildExpandedContext(
        ['0xaaa', '0xbbb'],
        [],
        { unknownSlot: '0xccc' },
        { someOther: 5 },
      );
      expect(result).toEqual(['0xaaa', '0xbbb']);
    });
  });

  describe('getContextSlots', () => {
    it('returns slots with on-chain values and no sync warning', async () => {
      prisma.vault.findUniqueOrThrow.mockResolvedValue({
        address: '0xvault',
        contextSlots: {
          '0': { name: 'slot-a', createdByAutomationId: 'auto-1' },
        },
      });

      jest
        .spyOn(service, 'readOnChainContext')
        .mockResolvedValue(['0xabc']);

      const result = await service.getContextSlots('0xvault');

      expect(result).toEqual({
        slots: {
          '0': {
            name: 'slot-a',
            createdByAutomationId: 'auto-1',
            currentOnChainValue: '0xabc',
          },
        },
        contextLength: 1,
        dbSlotCount: 1,
        syncWarning: false,
      });
    });

    it('returns syncWarning true when DB and on-chain lengths differ', async () => {
      prisma.vault.findUniqueOrThrow.mockResolvedValue({
        address: '0xvault',
        contextSlots: {
          '0': { name: 'slot-a', createdByAutomationId: 'auto-1' },
        },
      });

      jest
        .spyOn(service, 'readOnChainContext')
        .mockResolvedValue(['0xabc', '0xdef']);

      const result = await service.getContextSlots('0xvault');

      expect(result.syncWarning).toBe(true);
      expect(result.dbSlotCount).toBe(1);
      expect(result.contextLength).toBe(2);
    });

    it('handles fresh vault with no slots and empty on-chain context', async () => {
      prisma.vault.findUniqueOrThrow.mockResolvedValue({
        address: '0xvault',
        contextSlots: {},
      });

      jest.spyOn(service, 'readOnChainContext').mockResolvedValue([]);

      const result = await service.getContextSlots('0xvault');

      expect(result).toEqual({
        slots: {},
        contextLength: 0,
        dbSlotCount: 0,
        syncWarning: false,
      });
    });

    it('returns 0x for on-chain values when slot index exceeds on-chain length', async () => {
      prisma.vault.findUniqueOrThrow.mockResolvedValue({
        address: '0xvault',
        contextSlots: {
          '0': { name: 'slot-a', createdByAutomationId: 'auto-1' },
          '1': { name: 'slot-b', createdByAutomationId: 'auto-1' },
        },
      });

      jest.spyOn(service, 'readOnChainContext').mockResolvedValue(['0xabc']);

      const result = await service.getContextSlots('0xvault');

      expect(result.slots['1'].currentOnChainValue).toBe('0x');
    });
  });
});
