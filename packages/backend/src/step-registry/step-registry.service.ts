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
        // paramSchema + abiFragment are needed client-side for node-init default
        // materialization, the store's param-validation pass, and the
        // encode-boundary mapper (friendly → raw) before POST /encode.
        paramSchema: true,
        abiFragment: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  findById(id: string) {
    return this.prisma.stepType.findUnique({ where: { id } });
  }
}
