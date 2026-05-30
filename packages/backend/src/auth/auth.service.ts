import {
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../database/prisma.service';
import { UserService } from '../user/user.service';
import { SignatureService } from './signature.service';
import { randomBytes, createHash } from 'crypto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly userService: UserService,
    private readonly signatureService: SignatureService,
  ) {}

  async generateNonce(): Promise<string> {
    const nonce = randomBytes(16).toString('hex');
    const expirySeconds = this.configService.get<number>(
      'NONCE_EXPIRY_SECONDS',
      300,
    );
    const expiresAt = new Date(Date.now() + expirySeconds * 1000);

    await this.prisma.nonce.create({
      data: { nonce, expiresAt },
    });

    return nonce;
  }

  async verify(
    message: string,
    signature: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const parsed = this.signatureService.parse(message);

    const consumedNonce = await this.prisma.nonce.updateMany({
      where: {
        nonce: parsed.nonce,
        used: false,
        expiresAt: { gt: new Date() },
      },
      data: { used: true },
    });

    if (consumedNonce.count === 0) {
      throw new UnauthorizedException('NONCE_INVALID');
    }

    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:5173',
    );
    const expectedDomain = new URL(frontendUrl).hostname;

    const result = await this.signatureService.verify(
      message,
      signature,
      expectedDomain,
      parsed.nonce,
    );

    if (!result.success || !result.address) {
      throw new UnauthorizedException('SIGNATURE_INVALID');
    }

    const user = await this.userService.findOrCreate(result.address);

    const accessToken = this.jwtService.sign({ sub: user.walletAddress });

    const refreshToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256')
      .update(refreshToken)
      .digest('hex');
    const refreshExpiryDays = this.configService.get<number>(
      'REFRESH_TOKEN_EXPIRY_DAYS',
      7,
    );
    const expiresAt = new Date(
      Date.now() + refreshExpiryDays * 24 * 60 * 60 * 1000,
    );

    await this.prisma.refreshToken.create({
      data: {
        tokenHash,
        walletAddress: user.walletAddress,
        expiresAt,
      },
    });

    return { accessToken, refreshToken };
  }
}
