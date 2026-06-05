import { UnauthorizedException } from '@nestjs/common';
import { KeeperIngestGuard, KEEPER_SECRET_HEADER } from './keeper-ingest.guard';

function ctx(headers: Record<string, any>): any {
  return { switchToHttp: () => ({ getRequest: () => ({ headers }) }) };
}

function guardWith(secret: string | undefined) {
  return new KeeperIngestGuard({ get: () => secret } as any);
}

describe('KeeperIngestGuard', () => {
  it('accepts the correct shared secret', () => {
    const guard = guardWith('s3cret');
    expect(guard.canActivate(ctx({ [KEEPER_SECRET_HEADER]: 's3cret' }))).toBe(true);
  });

  it('rejects a wrong secret', () => {
    const guard = guardWith('s3cret');
    expect(() => guard.canActivate(ctx({ [KEEPER_SECRET_HEADER]: 'nope' }))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a missing secret header', () => {
    const guard = guardWith('s3cret');
    expect(() => guard.canActivate(ctx({}))).toThrow(UnauthorizedException);
  });

  it('fails closed when the server secret is unset', () => {
    const guard = guardWith(undefined);
    expect(() => guard.canActivate(ctx({ [KEEPER_SECRET_HEADER]: 'anything' }))).toThrow(
      UnauthorizedException,
    );
  });
});
