import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { TokensController } from './tokens.controller';
import { TokensService } from './tokens.service';
import { PrismaService } from '../database/prisma.service';

describe('TokensController', () => {
  let controller: TokensController;
  let findMany: jest.Mock;

  const aaveTokens = [
    { address: '0x55d398326f99059fF775485246999027B3197955', symbol: 'USDT', decimals: 18 },
    { address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', symbol: 'WBNB', decimals: 18 },
  ];

  beforeEach(async () => {
    findMany = jest.fn().mockResolvedValue(aaveTokens);
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TokensController],
      providers: [
        TokensService,
        { provide: PrismaService, useValue: { protocolToken: { findMany } } },
      ],
    }).compile();
    controller = module.get<TokensController>(TokensController);
  });

  it('returns the curated allowlist for a known protocol', async () => {
    const result = await controller.getTokens('aave');
    expect(result).toEqual({ tokens: aaveTokens });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { protocol: 'aave', enabled: true } }),
    );
  });

  it('normalizes the protocol to lower case', async () => {
    await controller.getTokens('AAVE');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { protocol: 'aave', enabled: true } }),
    );
  });

  it('rejects a missing protocol', async () => {
    await expect(controller.getTokens(undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects an unsupported protocol', async () => {
    await expect(controller.getTokens('compound')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
