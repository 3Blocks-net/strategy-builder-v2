import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { User } from '@prisma/client';
import { getAddress } from 'ethers';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async findOrCreate(walletAddress: string): Promise<User> {
    const checksummed = getAddress(walletAddress);
    const now = new Date();
    return this.prisma.user.upsert({
      where: { walletAddress: checksummed },
      update: { lastLoginAt: now },
      create: { walletAddress: checksummed, lastLoginAt: now },
    });
  }
}
