import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { MeController } from './me.controller';
import { AuthService } from './auth.service';
import { SignatureService } from './signature.service';
import { JwtStrategy } from './jwt.strategy';
import { WalletAuthGuard } from './wallet-auth.guard';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    UserModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'dev-secret-change-me'),
        signOptions: {
          expiresIn: config.get('ACCESS_TOKEN_EXPIRY', '15m') as any,
        },
      }),
    }),
  ],
  controllers: [AuthController, MeController],
  providers: [
    AuthService,
    SignatureService,
    JwtStrategy,
    { provide: APP_GUARD, useClass: WalletAuthGuard },
  ],
  exports: [AuthService, SignatureService, JwtModule],
})
export class AuthModule {}
