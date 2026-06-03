import { Test, TestingModule } from '@nestjs/testing';
import { AbiCoder, Interface } from 'ethers';
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
    paramSchema: {
      type: 'object',
      properties: {
        interval: { type: 'object', title: 'Interval', 'x-ui-widget': 'duration' },
        timeSlot: {
          type: 'integer',
          title: 'Time Slot',
          'x-ui-widget': 'context-slot',
          'x-ui-slot-access': 'read-write',
        },
      },
      required: ['interval', 'timeSlot'],
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
    paramSchema: {
      type: 'object',
      properties: {
        token: { type: 'string', 'x-ui-widget': 'token-selector' },
        recipient: { type: 'string', 'x-ui-widget': 'account-selector' },
        amount: { type: 'string', 'x-ui-widget': 'amount' },
        amountFromSlot: {
          type: 'integer',
          'x-ui-widget': 'context-slot',
          'x-ui-slot-access': 'read',
          default: 4294967295,
        },
        amountToSlot: {
          type: 'integer',
          'x-ui-widget': 'context-slot',
          'x-ui-slot-access': 'write',
          default: 4294967295,
        },
        feeRegistry: { type: 'string', 'x-ui-widget': 'account-selector' },
      },
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
    paramSchema: {
      type: 'object',
      properties: {
        token: { type: 'string', 'x-ui-widget': 'token-selector' },
        account: { type: 'string', 'x-ui-widget': 'account-selector' },
        minBalance: { type: 'string', 'x-ui-widget': 'amount' },
        aboveOrEqual: { type: 'boolean', default: true },
        minBalanceFromSlot: {
          type: 'integer',
          'x-ui-widget': 'context-slot',
          'x-ui-slot-access': 'read',
          default: 4294967295,
        },
      },
    },
  },
  // Appended at the end so the index-based mockStepTypes[0..2] references in the
  // encodeParams tests stay stable.
  {
    id: 'st-timer',
    name: 'Timer Condition',
    category: 'CONDITION',
    contractAddress: '0x9A676e781A523b5d0C0e43731313A708CB607508',
    selector: CHECK_SELECTOR,
    abiFragment: {
      type: 'tuple',
      components: [
        { name: 'delta', type: 'uint256' },
        { name: 'timeSlot', type: 'uint32' },
      ],
    },
    paramSchema: {
      type: 'object',
      properties: {
        delta: { type: 'object', title: 'Delay', 'x-ui-widget': 'duration' },
        startTime: {
          type: 'integer',
          title: 'Start Time',
          'x-ui-widget': 'start-time',
          'x-ui-time-slot-field': 'timeSlot',
        },
        timeSlot: {
          type: 'integer',
          title: 'Time Slot',
          'x-ui-widget': 'context-slot',
          'x-ui-slot-access': 'read-write',
          'x-ui-hidden': true,
        },
      },
      required: ['delta', 'timeSlot'],
    },
  },
  {
    id: 'st-aave-supply',
    name: 'Aave V3 Supply',
    category: 'ACTION',
    contractAddress: '0x1111111111111111111111111111111111111111',
    selector: EXECUTE_SELECTOR,
    abiFragment: {
      type: 'tuple',
      components: [
        { name: 'asset', type: 'address' },
        { name: 'mode', type: 'uint8' },
        { name: 'amount', type: 'uint256' },
        { name: 'amountFromSlot', type: 'uint32' },
        { name: 'targetHealthFactor', type: 'uint256' },
        { name: 'amountToSlot', type: 'uint32' },
      ],
    },
    paramSchema: {
      type: 'object',
      properties: {
        asset: { type: 'string', 'x-ui-widget': 'token-selector' },
        mode: {
          type: 'integer',
          'x-ui-widget': 'aave-amount-mode',
          'x-ui-target-hf-field': 'targetHealthFactor',
          default: 0,
        },
        amount: { type: 'string', 'x-ui-widget': 'token-amount', 'x-ui-amount-token-field': 'asset' },
        amountFromSlot: {
          type: 'integer',
          'x-ui-widget': 'context-slot',
          'x-ui-slot-access': 'read',
          default: 4294967295,
        },
        targetHealthFactor: { type: 'string', 'x-ui-hidden': true, default: '0' },
        amountToSlot: {
          type: 'integer',
          'x-ui-widget': 'context-slot',
          'x-ui-slot-access': 'write',
          default: 4294967295,
        },
      },
      required: ['asset', 'mode'],
    },
  },
  {
    id: 'st-aave-borrow',
    name: 'Aave V3 Borrow',
    category: 'ACTION',
    contractAddress: '0x2222222222222222222222222222222222222222',
    selector: EXECUTE_SELECTOR,
    abiFragment: {
      type: 'tuple',
      components: [
        { name: 'asset', type: 'address' },
        { name: 'mode', type: 'uint8' },
        { name: 'amount', type: 'uint256' },
        { name: 'amountFromSlot', type: 'uint32' },
        { name: 'targetHealthFactor', type: 'uint256' },
        { name: 'amountToSlot', type: 'uint32' },
      ],
    },
    paramSchema: {
      type: 'object',
      properties: {
        asset: { type: 'string', 'x-ui-widget': 'token-selector', 'x-ui-token-source': 'aave' },
        mode: { type: 'integer', 'x-ui-widget': 'aave-amount-mode', 'x-ui-modes': [0, 1], default: 0 },
        amount: { type: 'string', 'x-ui-widget': 'token-amount', 'x-ui-amount-token-field': 'asset', 'x-ui-hidden': true, default: '0' },
        amountFromSlot: { type: 'integer', 'x-ui-widget': 'context-slot', 'x-ui-slot-access': 'read', 'x-ui-hidden': true, default: 4294967295 },
        targetHealthFactor: { type: 'string', 'x-ui-hidden': true, default: '0' },
        amountToSlot: { type: 'integer', 'x-ui-widget': 'context-slot', 'x-ui-slot-access': 'write', default: 4294967295 },
      },
      required: ['asset', 'mode'],
    },
  },
  {
    id: 'st-pcs-swap',
    name: 'PancakeSwap V3 Swap',
    category: 'ACTION',
    contractAddress: '0x3333333333333333333333333333333333333333',
    selector: EXECUTE_SELECTOR,
    abiFragment: {
      type: 'tuple',
      components: [
        { name: 'tokenIn', type: 'address' },
        { name: 'tokenOut', type: 'address' },
        { name: 'fee', type: 'uint24' },
        { name: 'amountIn', type: 'uint256' },
        { name: 'amountInFromSlot', type: 'uint32' },
        { name: 'amountOutToSlot', type: 'uint32' },
        { name: 'amountOutMinimum', type: 'uint256' },
        { name: 'minOutFromSlot', type: 'uint32' },
      ],
    },
    paramSchema: {
      type: 'object',
      properties: {
        tokenIn: { type: 'string', 'x-ui-widget': 'token-selector', 'x-ui-token-source': 'pancakeswap' },
        tokenOut: { type: 'string', 'x-ui-widget': 'token-selector', 'x-ui-token-source': 'pancakeswap' },
        fee: { type: 'integer', 'x-ui-widget': 'fee-tier', default: 500 },
        amountIn: { type: 'string', 'x-ui-widget': 'token-amount', 'x-ui-amount-token-field': 'tokenIn' },
        amountInFromSlot: { type: 'integer', 'x-ui-widget': 'context-slot', 'x-ui-slot-access': 'read', default: 4294967295 },
        amountOutToSlot: { type: 'integer', 'x-ui-widget': 'context-slot', 'x-ui-slot-access': 'write', default: 4294967295 },
        amountOutMinimum: { type: 'string', 'x-ui-hidden': true, default: '0' },
        minOutFromSlot: { type: 'integer', 'x-ui-widget': 'context-slot', 'x-ui-slot-access': 'read', 'x-ui-hidden': true, default: 4294967295 },
      },
      required: ['tokenIn', 'tokenOut', 'fee', 'amountIn'],
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

    it('encodes Aave amount-mode action params (mode enum + actual-out slot)', () => {
      const asset = '0x55d398326f99059fF775485246999027B3197955';
      const abiFragment = mockStepTypes.find((s) => s.id === 'st-aave-supply')!
        .abiFragment;
      const slotMapping = { swapOutput: 2, withdrawn: 3 };
      const result = service.encodeParams(
        {
          asset,
          mode: 1, // FROM_SLOT
          amount: '0',
          amountFromSlot: 'swapOutput',
          targetHealthFactor: '0',
          amountToSlot: 'withdrawn',
        },
        abiFragment as any,
        slotMapping,
      );
      const decoded = abiCoder.decode(
        ['address', 'uint8', 'uint256', 'uint32', 'uint256', 'uint32'],
        result,
      );
      expect(decoded[0]).toBe(asset);
      expect(decoded[1]).toBe(1n); // mode
      expect(decoded[3]).toBe(2n); // amountFromSlot resolved swapOutput → 2
      expect(decoded[5]).toBe(3n); // amountToSlot resolved withdrawn → 3
    });

    it('encodes Aave Borrow FIXED params with variable-rate tuple shape', () => {
      const asset = '0x55d398326f99059fF775485246999027B3197955';
      const abiFragment = mockStepTypes.find((s) => s.id === 'st-aave-borrow')!
        .abiFragment;
      const result = service.encodeParams(
        {
          asset,
          mode: 0, // FIXED
          amount: '5000000000000000000',
          amountFromSlot: 4294967295,
          targetHealthFactor: '0',
          amountToSlot: 'borrowed',
        },
        abiFragment as any,
        { borrowed: 1 },
      );
      const decoded = abiCoder.decode(
        ['address', 'uint8', 'uint256', 'uint32', 'uint256', 'uint32'],
        result,
      );
      expect(decoded[0]).toBe(asset);
      expect(decoded[1]).toBe(0n); // FIXED
      expect(decoded[2]).toBe(5000000000000000000n);
      expect(decoded[5]).toBe(1n); // amountToSlot resolved borrowed → 1
    });

    it('encodes Aave Repay MAX (full debt) params with the actual-out slot', () => {
      const asset = '0x55d398326f99059fF775485246999027B3197955';
      const abiFragment = mockStepTypes.find((s) => s.id === 'st-aave-supply')!
        .abiFragment;
      const result = service.encodeParams(
        {
          asset,
          mode: 2, // MAX_AVAILABLE = repay full debt
          amount: '0',
          amountFromSlot: 4294967295,
          targetHealthFactor: '0',
          amountToSlot: 'repaid',
        },
        abiFragment as any,
        { repaid: 4 },
      );
      const decoded = abiCoder.decode(
        ['address', 'uint8', 'uint256', 'uint32', 'uint256', 'uint32'],
        result,
      );
      expect(decoded[1]).toBe(2n); // MAX
      expect(decoded[3]).toBe(BigInt(4294967295)); // amountFromSlot NO_SLOT
      expect(decoded[5]).toBe(4n); // amountToSlot resolved repaid → 4
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

    it('applies the schema default (NO_SLOT) for an unset optional slot field', () => {
      // amountFromSlot/amountToSlot left unset must encode to NO_SLOT
      // (4294967295), NOT 0 — otherwise the action reads/writes slot 0.
      const result = service.encodeParams(
        {
          token: '0x55d398326f99059fF775485246999027B3197955',
          recipient: '0x1234567890123456789012345678901234567890',
          amount: '1000',
        },
        mockStepTypes[1].abiFragment as any,
        {},
        mockStepTypes[1].paramSchema as any,
      );
      const decoded = abiCoder.decode(
        ['address', 'address', 'uint256', 'uint32', 'uint32', 'address'],
        result,
      );
      expect(decoded[3]).toBe(4294967295n); // amountFromSlot
      expect(decoded[4]).toBe(4294967295n); // amountToSlot
    });

    it('throws on an unresolved context variable name', () => {
      expect(() =>
        service.encodeParams(
          { interval: '86400', timeSlot: 'doesNotExist' },
          mockStepTypes[0].abiFragment as any,
          {},
          mockStepTypes[0].paramSchema as any,
        ),
      ).toThrow(/context variable/i);
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

    it('rejects raw params with interval = 0 (raw-mode guard, HTTP 400)', async () => {
      const graph = {
        nodes: [
          {
            id: 'c1',
            type: 'CONDITION' as const,
            data: {
              stepTypeId: 'st-interval',
              params: { interval: '0', timeSlot: 'dailyTimer' },
            },
          },
        ],
        edges: [],
      };

      await expect(
        service.encode('v1', '0xvault', 'a1', graph),
      ).rejects.toThrow(/Invalid step parameters/i);
    });

    it('encodes TARGET_HF with targetHealthFactor in 1e18 wad (mode → raw enum)', async () => {
      const asset = '0x55d398326f99059fF775485246999027B3197955';
      const abiFragment = mockStepTypes.find((s) => s.id === 'st-aave-supply')!
        .abiFragment;
      const result = service.encodeParams(
        {
          asset,
          mode: 3, // TARGET_HF
          amount: '0',
          amountFromSlot: 4294967295,
          targetHealthFactor: '1500000000000000000', // 1.5e18 (mapped frontend-side)
          amountToSlot: 4294967295,
        },
        abiFragment as any,
        {},
      );
      const decoded = abiCoder.decode(
        ['address', 'uint8', 'uint256', 'uint32', 'uint256', 'uint32'],
        result,
      );
      expect(decoded[1]).toBe(3n); // TARGET_HF
      expect(decoded[4]).toBe(1500000000000000000n); // 1.5e18
    });

    it('rejects TARGET_HF with targetHealthFactor ≤ 1.05e18 (raw-mode guard, HTTP 400)', async () => {
      const graph = {
        nodes: [
          {
            id: 'a1',
            type: 'ACTION' as const,
            data: {
              stepTypeId: 'st-aave-supply',
              params: {
                asset: '0x55d398326f99059fF775485246999027B3197955',
                mode: 3,
                amount: '0',
                amountFromSlot: 4294967295,
                targetHealthFactor: '1050000000000000000', // exactly 1.05e18 → rejected
                amountToSlot: 4294967295,
              },
            },
          },
        ],
        edges: [],
      };
      await expect(
        service.encode('v1', '0xvault', 'a1', graph),
      ).rejects.toThrow(/Invalid step parameters/i);
    });

    it('encodes a PancakeSwap swap (fee tier + amountOut slot + amountOutMinimum 0)', () => {
      const tokenIn = '0x55d398326f99059fF775485246999027B3197955';
      const tokenOut = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
      const abiFragment = mockStepTypes.find((s) => s.id === 'st-pcs-swap')!.abiFragment;
      const result = service.encodeParams(
        {
          tokenIn,
          tokenOut,
          fee: 500,
          amountIn: '1000000000000000000',
          amountInFromSlot: 4294967295,
          amountOutToSlot: 'swapOut',
          amountOutMinimum: '0',
          minOutFromSlot: 4294967295,
        },
        abiFragment as any,
        { swapOut: 2 },
      );
      const decoded = abiCoder.decode(
        ['address', 'address', 'uint24', 'uint256', 'uint32', 'uint32', 'uint256', 'uint32'],
        result,
      );
      expect(decoded[0]).toBe(tokenIn);
      expect(decoded[2]).toBe(500n); // fee tier
      expect(decoded[5]).toBe(2n); // amountOutToSlot resolved swapOut → 2
      expect(decoded[6]).toBe(0n); // amountOutMinimum ships at 0
    });

    it('rejects a swap with an invalid fee tier (raw-mode guard, HTTP 400)', async () => {
      const graph = {
        nodes: [
          {
            id: 's1',
            type: 'ACTION' as const,
            data: {
              stepTypeId: 'st-pcs-swap',
              params: {
                tokenIn: '0x55d398326f99059fF775485246999027B3197955',
                tokenOut: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
                fee: 3000, // invalid (not a PCS V3 tier)
                amountIn: '1000000000000000000',
                amountInFromSlot: 4294967295,
                amountOutToSlot: 4294967295,
                amountOutMinimum: '0',
                minOutFromSlot: 4294967295,
              },
            },
          },
        ],
        edges: [],
      };
      await expect(service.encode('v1', '0xvault', 's1', graph)).rejects.toThrow(/Invalid step parameters/i);
    });

    it('rejects an Aave supply with a zero asset (raw-mode zero-token guard, HTTP 400)', async () => {
      const graph = {
        nodes: [
          {
            id: 'a1',
            type: 'ACTION' as const,
            data: {
              stepTypeId: 'st-aave-supply',
              params: {
                asset: '0x0000000000000000000000000000000000000000',
                mode: 0,
                amount: '1000',
                amountFromSlot: 4294967295,
                targetHealthFactor: '0',
                amountToSlot: 4294967295,
              },
            },
          },
        ],
        edges: [],
      };

      await expect(
        service.encode('v1', '0xvault', 'a1', graph),
      ).rejects.toThrow(/Invalid step parameters/i);
    });

    it('allocates context slots referenced by name and resolves them in step data', async () => {
      const allocateSlots = jest
        .fn()
        .mockResolvedValue({ dailyTimer: 1 });
      (service as any).contextService.allocateSlots = allocateSlots;
      (service as any).contextService.buildExpandedContext = jest
        .fn()
        .mockReturnValue(['0x', '0x00']);

      const graph = {
        nodes: [
          {
            id: 'c1',
            type: 'CONDITION' as const,
            data: {
              stepTypeId: 'st-interval',
              params: { interval: '86400', timeSlot: 'dailyTimer' },
            },
          },
        ],
        edges: [],
      };

      const result = await service.encode('v1', '0xvault', 'a1', graph);

      // slot name extracted and allocated
      expect(allocateSlots).toHaveBeenCalledWith(
        'v1',
        ['dailyTimer'],
        'a1',
      );
      // a setContext tx is required to create the slot on-chain
      expect(result.requiresContextTx).toBe(true);
      expect(result.contextCalldata).toBeTruthy();
      expect(result.contextChanges.some((c) => c.slotName === 'dailyTimer')).toBe(true);
      // the timeSlot field encodes the resolved index (1), not 0/default
      const decoded = abiCoder.decode(['uint256', 'uint32'], result.steps[0].data);
      expect(decoded[1]).toBe(1n);
    });

    it('encodes a Timer condition with raw delta seconds', async () => {
      const graph = {
        nodes: [
          {
            id: 't1',
            type: 'CONDITION' as const,
            data: {
              stepTypeId: 'st-timer',
              params: { delta: '2592000', timeSlot: 0 },
            },
          },
        ],
        edges: [],
      };

      const result = await service.encode('v1', '0xvault', 'a1', graph);

      expect(result.stepCount).toBe(1);
      const decoded = abiCoder.decode(['uint256', 'uint32'], result.steps[0].data);
      expect(decoded[0]).toBe(2592000n); // 30 days in seconds
    });

    it('rejects raw params with timer delta = 0 (raw-mode guard)', async () => {
      const graph = {
        nodes: [
          {
            id: 't1',
            type: 'CONDITION' as const,
            data: {
              stepTypeId: 'st-timer',
              params: { delta: '0', timeSlot: 'timerSlot' },
            },
          },
        ],
        edges: [],
      };

      await expect(
        service.encode('v1', '0xvault', 'a1', graph),
      ).rejects.toThrow(/Invalid step parameters/i);
    });

    it('resolves name-keyed contextOverrides to the slot init value (start-time)', async () => {
      const allocateSlots = jest.fn().mockResolvedValue({ dailyTimer: 0 });
      (service as any).contextService.allocateSlots = allocateSlots;
      const buildExpanded = jest.fn().mockReturnValue(['0x00']);
      (service as any).contextService.buildExpandedContext = buildExpanded;
      (service as any).contextService.readOnChainContext = jest
        .fn()
        .mockResolvedValue([]);

      const ts = '0x' + '0'.repeat(56) + '654ac620';
      const graph = {
        nodes: [
          {
            id: 'c1',
            type: 'CONDITION' as const,
            data: {
              stepTypeId: 'st-interval',
              params: { interval: '86400', timeSlot: 'dailyTimer' },
            },
          },
        ],
        edges: [],
      };

      const result = await service.encode('v1', '0xvault', 'a1', graph, {
        dailyTimer: ts,
      });

      // name-keyed overrides + the slotMapping are forwarded so the slot init
      // value can be resolved by index
      expect(buildExpanded).toHaveBeenCalledWith(
        [],
        expect.any(Array),
        { dailyTimer: ts },
        { dailyTimer: 0 },
      );
      const change = result.contextChanges.find((c) => c.slotName === 'dailyTimer');
      expect(change?.newValue).toBe(ts);
    });

    it('leaves an unset optional slot field as NO_SLOT (regression: no slot 0)', async () => {
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
                // amountFromSlot / amountToSlot intentionally unset
              },
            },
          },
        ],
        edges: [],
      };

      const result = await service.encode('v1', '0xvault', 'a1', graph);

      expect(result.requiresContextTx).toBe(false);
      const decoded = abiCoder.decode(
        ['address', 'address', 'uint256', 'uint32', 'uint32', 'address'],
        result.steps[0].data,
      );
      expect(decoded[3]).toBe(4294967295n); // amountFromSlot
      expect(decoded[4]).toBe(4294967295n); // amountToSlot
    });
  });

  describe('encodeUpdate', () => {
    it('encodes updateAutomationSteps calldata', async () => {
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
                amount: '500',
              },
            },
          },
        ],
        edges: [],
      };

      const result = await service.encodeUpdate('v1', '0xvault', 'a1', 3, graph);

      expect(result.functionName).toBe('updateAutomationSteps');
      expect(result.stepCount).toBe(1);
      expect(result.automationCalldata).toBeTruthy();
    });

    it('does not require context TX when no new slots and no overrides', async () => {
      const graph = {
        nodes: [
          {
            id: 'a1',
            type: 'ACTION' as const,
            data: { stepTypeId: 'st-transfer', params: { token: '0x55d398326f99059fF775485246999027B3197955', recipient: '0x1234567890123456789012345678901234567890', amount: '100' } },
          },
        ],
        edges: [],
      };

      const result = await service.encodeUpdate('v1', '0xvault', 'a1', 0, graph);
      expect(result.requiresContextTx).toBe(false);
      expect(result.contextCalldata).toBeUndefined();
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

  describe('encodeExecute', () => {
    const iface = new Interface([
      'function executeAutomation(uint32 automationId) external',
    ]);

    it('encodes executeAutomation calldata for the given onChainId', () => {
      const calldata = service.encodeExecute(3);
      const decoded = iface.decodeFunctionData('executeAutomation', calldata);
      expect(decoded[0]).toBe(3n);
    });

    it('encodes different onChainIds differently', () => {
      expect(service.encodeExecute(0)).not.toBe(service.encodeExecute(1));
    });
  });
});
