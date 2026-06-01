import { Test, TestingModule } from '@nestjs/testing';
import { StepRegistryService } from './step-registry.service';
import { PrismaService } from '../database/prisma.service';

describe('StepRegistryService', () => {
  let service: StepRegistryService;
  let prisma: PrismaService;

  const mockStepTypes = [
    {
      id: '1',
      name: 'ERC-20 Transfer',
      description: 'Transfers ERC-20 tokens',
      category: 'ACTION',
      contractAddress: '0xabc',
      selector: '0x24856bc3',
      afterExecutionSelector: null,
    },
    {
      id: '2',
      name: 'Interval Condition',
      description: 'Time-based trigger',
      category: 'CONDITION',
      contractAddress: '0xdef',
      selector: '0xd89f1e36',
      afterExecutionSelector: '0xb2792168',
    },
  ];

  const mockFullStepType = {
    ...mockStepTypes[0],
    abiFragment: { type: 'tuple', components: [] },
    paramSchema: { type: 'object', properties: {} },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StepRegistryService,
        {
          provide: PrismaService,
          useValue: {
            stepType: {
              findMany: jest.fn().mockResolvedValue(mockStepTypes),
              findUnique: jest.fn().mockResolvedValue(mockFullStepType),
            },
          },
        },
      ],
    }).compile();

    service = module.get<StepRegistryService>(StepRegistryService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('findAll', () => {
    it('returns all step types without paramSchema or abiFragment', async () => {
      const result = await service.findAll();

      expect(result).toEqual(mockStepTypes);
      expect(prisma.stepType.findMany).toHaveBeenCalledWith({
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          contractAddress: true,
          selector: true,
          afterExecutionSelector: true,
        },
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('findById', () => {
    it('returns the full step type including paramSchema', async () => {
      const result = await service.findById('1');

      expect(result).toEqual(mockFullStepType);
      expect(prisma.stepType.findUnique).toHaveBeenCalledWith({
        where: { id: '1' },
      });
    });

    it('returns null for a non-existent id', async () => {
      (prisma.stepType.findUnique as jest.Mock).mockResolvedValueOnce(null);

      const result = await service.findById('nonexistent');
      expect(result).toBeNull();
    });
  });
});
