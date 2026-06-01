import { Test, TestingModule } from '@nestjs/testing';
import { AbiCoder } from 'ethers';
import { EncodingService } from './encoding.service';
import { ContextService } from './context.service';
import { PrismaService } from '../database/prisma.service';

const abiCoder = AbiCoder.defaultAbiCoder();

const CHECK_SELECTOR = '0xd89f1e36';
const EXECUTE_SELECTOR = '0x24856bc3';

const mockStepTypes = [
  {
    id: 'st-interval',
    name: 'Interval Condition',
    category: 'CONDITION',
    contractAddress: '0x60C79446f00CB9ebD79c4e2d3d6a773314bdbfaa',
    selector: CHECK_SELECTOR,
    abiFragment: {
      type: 'tuple',
      components: [
        { name: 'interval', type: 'uint256' },
        { name: 'timeSlot', type: 'uint32' },
      ],
    },
  },
  {
    id: 'st-transfer',
    name: 'ERC-20 Transfer',
    category: 'ACTION',
    contractAddress: '0x284849e6a60F716614Fb28279E2446FE995C5711',
    selector: EXECUTE_SELECTOR,
    abiFragment: {
      type: 'tuple',
      components: [
        { name: 'token', type: 'address' },
        { name: 'recipient', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'amountFromSlot', type: 'uint32' },
        { name: 'amountToSlot', type: 'uint32' },
        { name: 'feeRegistry', type: 'address' },
      ],
    },
  },
  {
    id: 'st-balance',
    name: 'Token Balance Condition',
    category: 'CONDITION',
    contractAddress: '0x3052cC9622a0c2Fab6D51D03463d7978e62EbC7F',
    selector: CHECK_SELECTOR,
    abiFragment: {
      type: 'tuple',
      components: [
        { name: 'token', type: 'address' },
        { name: 'account', type: 'address' },
        { name: 'minBalance', type: 'uint256' },
        { name: 'aboveOrEqual', type: 'bool' },
        { name: 'minBalanceFromSlot', type: 'uint32' },
      ],
    },
  },
];

describe('EncodingService', () => {
  let service: EncodingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EncodingService,
        {
          provide: PrismaService,
          useValue: {
            stepType: { findMany: jest.fn().mockResolvedValue(mockStepTypes) },
          },
        },
        {
          provide: ContextService,
          useValue: {
            allocateSlots: jest.fn().mockResolvedValue({}),
            readOnChainContext: jest.fn().mockResolvedValue([]),
            buildExpandedContext: jest.fn().mockReturnValue([]),
          },
        },
      ],
    }).compile();

    service = module.get<EncodingService>(EncodingService);
  });

  describe('encodeParams', () => {
    it('encodes IntervalCondition params', () => {
      const result = service.encodeParams(
        { interval: '86400', timeSlot: 0 },
        mockStepTypes[0].abiFragment as any,
        {},
      );
      const decoded = abiCoder.decode(['uint256', 'uint32'], result);
      expect(decoded[0]).toBe(86400n);
      expect(decoded[1]).toBe(0n);
    });

    it('encodes ERC20TransferAction params', () => {
      const token = '0x55d398326f99059fF775485246999027B3197955';
      const recipient = '0x1234567890123456789012345678901234567890';
      const result = service.encodeParams(
        {
          token,
          recipient,
          amount: '1000000000000000000',
          amountFromSlot: 4294967295,
          amountToSlot: 4294967295,
          feeRegistry: '0x0000000000000000000000000000000000000000',
        },
        mockStepTypes[1].abiFragment as any,
        {},
      );
      const decoded = abiCoder.decode(
        ['address', 'address', 'uint256', 'uint32', 'uint32', 'address'],
        result,
      );
      expect(decoded[0]).toBe(token);
      expect(decoded[1]).toBe(recipient);
      expect(decoded[2]).toBe(1000000000000000000n);
      expect(decoded[3]).toBe(BigInt(4294967295));
      expect(decoded[4]).toBe(BigInt(4294967295));
    });

    it('encodes TokenBalanceCondition params', () => {
      const token = '0x55d398326f99059fF775485246999027B3197955';
      const account = '0x1234567890123456789012345678901234567890';
      const result = service.encodeParams(
        {
          token,
          account,
          minBalance: '5000000000000000000',
          aboveOrEqual: true,
          minBalanceFromSlot: 4294967295,
        },
        mockStepTypes[2].abiFragment as any,
        {},
      );
      const decoded = abiCoder.decode(
        ['address', 'address', 'uint256', 'bool', 'uint32'],
        result,
      );
      expect(decoded[0]).toBe(token);
      expect(decoded[3]).toBe(true);
      expect(decoded[4]).toBe(BigInt(4294967295));
    });

    it('resolves context slot names to indices', () => {
      const slotMapping = { 'next-trigger-time': 0 };
      const result = service.encodeParams(
        { interval: '86400', timeSlot: 'next-trigger-time' },
        mockStepTypes[0].abiFragment as any,
        slotMapping,
      );
      const decoded = abiCoder.decode(['uint256', 'uint32'], result);
      expect(decoded[1]).toBe(0n);
    });

    it('uses defaults for missing params', () => {
      const result = service.encodeParams(
        {},
        mockStepTypes[0].abiFragment as any,
        {},
      );
      const decoded = abiCoder.decode(['uint256', 'uint32'], result);
      expect(decoded[0]).toBe(0n);
      expect(decoded[1]).toBe(0n);
    });
  });

  describe('encode', () => {
    it('encodes a single condition node', async () => {
      const graph = {
        nodes: [
          {
            id: 'n1',
            type: 'CONDITION' as const,
            data: {
              stepTypeId: 'st-interval',
              params: { interval: '3600', timeSlot: 0 },
            },
          },
        ],
        edges: [],
      };

      const result = await service.encode('v1', '0xvault', 'a1', graph);

      expect(result.stepCount).toBe(1);
      expect(result.ownerOnly).toBe(false);
      expect(result.functionName).toBe('createAutomation');
      expect(result.steps[0].stepType).toBe(0);
      expect(result.automationCalldata).toBeTruthy();
    });

    it('encodes condition → action as public automation', async () => {
      const graph = {
        nodes: [
          {
            id: 'c1',
            type: 'CONDITION' as const,
            data: {
              stepTypeId: 'st-interval',
              params: { interval: '86400', timeSlot: 0 },
            },
          },
          {
            id: 'a1',
            type: 'ACTION' as const,
            data: {
              stepTypeId: 'st-transfer',
              params: {
                token: '0x55d398326f99059fF775485246999027B3197955',
                recipient: '0x1234567890123456789012345678901234567890',
                amount: '1000',
                amountFromSlot: 4294967295,
                amountToSlot: 4294967295,
              },
            },
          },
        ],
        edges: [{ source: 'c1', target: 'a1', sourceHandle: 'true' as const }],
      };

      const result = await service.encode('v1', '0xvault', 'a1', graph);

      expect(result.stepCount).toBe(2);
      expect(result.functionName).toBe('createAutomation');
      expect(result.ownerOnly).toBe(false);
      expect(result.steps[0].stepType).toBe(0); // CONDITION
      expect(result.steps[1].stepType).toBe(1); // ACTION
      expect(result.steps[0].nextOnTrue).toBe(1);
      expect(result.steps[0].nextOnFalse).toBe(0xffffffff);
      expect(result.steps[1].nextOnTrue).toBe(0xffffffff);
      expect(result.steps[1].nextOnFalse).toBe(0xffffffff);
    });

    it('encodes action-first as owner-only automation', async () => {
      const graph = {
        nodes: [
          {
            id: 'a1',
            type: 'ACTION' as const,
            data: {
              stepTypeId: 'st-transfer',
              params: {
                token: '0x55d398326f99059fF775485246999027B3197955',
                recipient: '0x1234567890123456789012345678901234567890',
                amount: '1000',
              },
            },
          },
        ],
        edges: [],
      };

      const result = await service.encode('v1', '0xvault', 'a1', graph);

      expect(result.ownerOnly).toBe(true);
      expect(result.functionName).toBe('createOwnerAutomation');
    });

    it('rejects empty graph', async () => {
      await expect(
        service.encode('v1', '0xvault', 'a1', { nodes: [], edges: [] }),
      ).rejects.toThrow('Graph must have at least one node');
    });
  });

  describe('encodeToggle', () => {
    it('encodes setAutomationActive calldata', () => {
      const calldata = service.encodeToggle(0, false);
      expect(calldata).toBeTruthy();
      expect(calldata.startsWith('0x')).toBe(true);
    });

    it('encodes activate and deactivate differently', () => {
      const activate = service.encodeToggle(1, true);
      const deactivate = service.encodeToggle(1, false);
      expect(activate).not.toBe(deactivate);
    });
  });
});
