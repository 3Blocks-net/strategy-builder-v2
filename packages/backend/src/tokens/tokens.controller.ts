import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { TokensService } from './tokens.service';

const SUPPORTED_PROTOCOLS = ['aave', 'pancakeswap'];

@ApiTags('Tokens')
@Public()
@Controller('tokens')
export class TokensController {
  constructor(private readonly tokensService: TokensService) {}

  @Get()
  @ApiOperation({ summary: 'Get the curated token allowlist for a protocol' })
  @ApiQuery({ name: 'protocol', enum: SUPPORTED_PROTOCOLS })
  async getTokens(@Query('protocol') protocol?: string) {
    if (!protocol) {
      throw new BadRequestException('protocol query parameter is required');
    }
    const normalized = protocol.toLowerCase();
    if (!SUPPORTED_PROTOCOLS.includes(normalized)) {
      throw new BadRequestException(
        `Unsupported protocol '${protocol}'. Expected one of: ${SUPPORTED_PROTOCOLS.join(', ')}`,
      );
    }
    return this.tokensService.findByProtocol(normalized);
  }
}
