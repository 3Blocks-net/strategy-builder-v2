import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class StepRegistryService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.stepType.findMany({
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
  }

  findById(id: string) {
    return this.prisma.stepType.findUnique({ where: { id } });
  }
}
