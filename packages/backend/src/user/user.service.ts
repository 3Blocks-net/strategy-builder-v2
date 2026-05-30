import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { User } from '@prisma/client';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async findOrCreate(walletAddress: string): Promise<User> {
    const now = new Date();
    return this.prisma.user.upsert({
      where: { walletAddress },
      update: { lastLoginAt: now },
      create: { walletAddress, lastLoginAt: now },
    });
  }
}
