import { Controller, Get, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { VerifyDto } from './dto/verify.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('nonce')
  async getNonce() {
    const nonce = await this.authService.generateNonce();
    return { nonce };
  }

  @Post('verify')
  async verify(@Body() dto: VerifyDto) {
    return this.authService.verify(dto.message, dto.signature);
  }
}
