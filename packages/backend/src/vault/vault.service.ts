import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Contract, JsonRpcProvider, getAddress, isAddress } from 'ethers';
import { PrismaService } from '../database/prisma.service';
import { Vault } from '@prisma/client';

const FACTORY_ABI = [
  'function isRegisteredVault(address) external view returns (bool)',
];

const VAULT_ABI = ['function owner() external view returns (address)'];

@Injectable()
export class VaultService {
  private readonly logger = new Logger(VaultService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async createVault(
    ownerAddress: string,
    dto: {
      address: string;
      chainId: number;
      depositToken: string;
      txHash: string;
      createdAtBlock: number;
      label?: string;
    },
  ): Promise<Vault> {
    if (!isAddress(dto.address)) {
      throw new BadRequestException('INVALID_VAULT_ADDRESS');
    }

    const checksummedAddress = getAddress(dto.address);

    const existing = await this.prisma.vault.findUnique({
      where: { address: checksummedAddress },
    });
    if (existing) {
      throw new ConflictException('VAULT_ALREADY_REGISTERED');
    }

    await this.validateOnChain(checksummedAddress, ownerAddress);

    const label = dto.label ?? (await this.generateDefaultLabel(ownerAddress));

    const existingLabel = await this.prisma.vault.findUnique({
      where: {
        ownerAddress_label: { ownerAddress, label },
      },
    });
    if (existingLabel) {
      throw new ConflictException('LABEL_ALREADY_EXISTS');
    }

    return this.prisma.vault.create({
      data: {
        address: checksummedAddress,
        chainId: dto.chainId,
        ownerAddress,
        depositToken: getAddress(dto.depositToken),
        label,
        createdAtBlock: dto.createdAtBlock,
        txHash: dto.txHash,
      },
    });
  }

  async listVaults(ownerAddress: string): Promise<Vault[]> {
    return this.prisma.vault.findMany({
      where: { ownerAddress },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateLabel(
    vaultAddress: string,
    ownerAddress: string,
    label: string,
  ): Promise<Vault> {
    const existingLabel = await this.prisma.vault.findUnique({
      where: {
        ownerAddress_label: { ownerAddress, label },
      },
    });
    if (existingLabel && existingLabel.address !== vaultAddress) {
      throw new ConflictException('LABEL_ALREADY_EXISTS');
    }

    return this.prisma.vault.update({
      where: { address: vaultAddress },
      data: { label },
    });
  }

  private async validateOnChain(
    vaultAddress: string,
    expectedOwner: string,
  ): Promise<void> {
    const rpcUrl = this.configService.get<string>('RPC_URL');
    const factoryAddress = this.configService.get<string>('FACTORY_ADDRESS');

    if (!rpcUrl || !factoryAddress) {
      throw new BadRequestException(
        'ON_CHAIN_VALIDATION_NOT_CONFIGURED',
      );
    }

    const provider = new JsonRpcProvider(rpcUrl);
    const factory = new Contract(factoryAddress, FACTORY_ABI, provider);
    const vault = new Contract(vaultAddress, VAULT_ABI, provider);

    const isRegistered = await factory.isRegisteredVault(vaultAddress);
    if (!isRegistered) {
      throw new BadRequestException('VAULT_NOT_REGISTERED_ON_CHAIN');
    }

    const onChainOwner = await vault.owner();
    if (getAddress(onChainOwner) !== getAddress(expectedOwner)) {
      throw new BadRequestException('VAULT_OWNER_MISMATCH');
    }
  }

  private async generateDefaultLabel(ownerAddress: string): Promise<string> {
    const count = await this.prisma.vault.count({
      where: { ownerAddress },
    });
    return `Vault #${count + 1}`;
  }
}
