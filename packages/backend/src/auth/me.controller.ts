import { Controller, Get, Request } from '@nestjs/common';

@Controller('me')
export class MeController {
  @Get()
  getMe(@Request() req: any) {
    return { address: req.user.address };
  }
}
