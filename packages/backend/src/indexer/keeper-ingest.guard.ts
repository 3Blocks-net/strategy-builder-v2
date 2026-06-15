import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const KEEPER_SECRET_HEADER = 'x-keeper-secret';

/**
 * Shared-secret guard for the keeper ingest endpoint (PEC-219 #05).
 *
 * The ingest endpoint is `@Public()` (the wallet `APP_GUARD` can't authenticate
 * a keeper, which has no JWT), so this is the ONLY thing standing between an
 * untrusted caller and injecting fake failure rows. It checks the
 * `x-keeper-secret` header against `KEEPER_INGEST_SECRET`. If the secret is
 * unset on the server, all requests are rejected (fail closed).
 */
@Injectable()
export class KeeperIngestGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('KEEPER_INGEST_SECRET');
    if (!expected) throw new UnauthorizedException('KEEPER_INGEST_NOT_CONFIGURED');

    const req = context.switchToHttp().getRequest();
    const provided = req.headers?.[KEEPER_SECRET_HEADER];
    if (!provided || provided !== expected) {
      throw new UnauthorizedException('INVALID_KEEPER_SECRET');
    }
    return true;
  }
}
