import { Controller, Get, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { VerifyDto } from './dto/verify.dto';
import { RefreshDto } from './dto/refresh.dto';
import { Public } from './public.decorator';

@Public()
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

  @Post('refresh')
  async refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }
}
