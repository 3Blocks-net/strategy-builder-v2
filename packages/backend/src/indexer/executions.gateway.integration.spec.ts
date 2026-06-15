import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { getAddress } from 'ethers';
import { io, Socket } from 'socket.io-client';
import { ExecutionsGateway } from './executions.gateway';
import { VaultAccessService } from '../vault/vault-access.service';

const SECRET = 'test-secret';
const OWNER = getAddress('0x1111111111111111111111111111111111111111');
const OTHER = getAddress('0x2222222222222222222222222222222222222222');
const VAULT_A = getAddress('0x3333333333333333333333333333333333333333');

/**
 * The "kein Datenleck" boundary (PEC-219 #06): a real socket.io client only ever
 * receives executions for a vault it owns.
 */
describe('ExecutionsGateway (isolation e2e)', () => {
  let app: INestApplication;
  let gateway: ExecutionsGateway;
  let jwt: JwtService;
  let url: string;

  // Mock ownership: only OWNER owns VAULT_A.
  const access = {
    assertOwnership: jest.fn(async (vaultAddress: string, userAddress: string) => {
      if (getAddress(vaultAddress) === VAULT_A && getAddress(userAddress) === OWNER) {
        return { address: VAULT_A };
      }
      throw new Error('NOT_VAULT_OWNER');
    }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: SECRET })],
      providers: [
        ExecutionsGateway,
        { provide: VaultAccessService, useValue: access },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    gateway = moduleRef.get(ExecutionsGateway);
    jwt = moduleRef.get(JwtService);
    await app.listen(0);
    const port = (app.getHttpServer().address() as any).port;
    url = `http://localhost:${port}/executions`;
  });

  afterAll(async () => {
    await app.close();
  });

  const connect = (token: string): Promise<Socket> =>
    new Promise((resolve, reject) => {
      const socket = io(url, { auth: { token }, transports: ['websocket'], forceNew: true });
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', reject);
      setTimeout(() => reject(new Error('connect timeout')), 4000);
    });

  const subscribe = (socket: Socket, vaultAddress: string): Promise<any> =>
    new Promise((resolve, reject) => {
      socket.emit('subscribe', { vaultAddress }, (ack: any) => resolve(ack));
      socket.on('exception', reject);
      setTimeout(() => reject(new Error('subscribe timeout/rejected')), 3000);
    });

  it('delivers an execution to the owner subscribed to its room', async () => {
    const owner = await connect(jwt.sign({ sub: OWNER }));
    await subscribe(owner, VAULT_A);

    const received = new Promise<any>((resolve) => owner.once('execution', resolve));
    gateway.emitNewExecutions(VAULT_A, [{ automationId: 7, txHash: '0xabc', gasCompAmount: '1', gasCompUsd: '0.5', blockTimestamp: new Date() } as any]);

    const payload = await received;
    expect(payload.automationId).toBe(7);
    expect(payload.status).toBe('success');
    owner.disconnect();
  });

  it('does NOT deliver another wallet’s vault activity', async () => {
    const owner = await connect(jwt.sign({ sub: OWNER }));
    await subscribe(owner, VAULT_A);
    const other = await connect(jwt.sign({ sub: OTHER }));

    // OTHER is not in vault:A's room; assert non-delivery via a short timeout.
    let leaked = false;
    other.once('execution', () => (leaked = true));
    gateway.emitNewExecutions(VAULT_A, [{ automationId: 1, txHash: '0x1', gasCompAmount: null, gasCompUsd: null, blockTimestamp: new Date() } as any]);
    await new Promise((r) => setTimeout(r, 600));

    expect(leaked).toBe(false);
    owner.disconnect();
    other.disconnect();
  });

  it('rejects subscribing to a non-owned vault (never joins the room)', async () => {
    const other = await connect(jwt.sign({ sub: OTHER }));
    await expect(subscribe(other, VAULT_A)).rejects.toBeTruthy();
    other.disconnect();
  });

  it('disconnects a handshake with an invalid JWT', async () => {
    // socket.io establishes the transport, then the gateway calls
    // disconnect(true) in handleConnection → the client receives 'disconnect'.
    const socket = io(url, { auth: { token: 'garbage-token' }, transports: ['websocket'], forceNew: true });
    const disconnected = await new Promise<boolean>((resolve) => {
      socket.on('disconnect', () => resolve(true));
      setTimeout(() => resolve(false), 1500);
    });
    expect(disconnected).toBe(true);
    socket.disconnect();
  });
});
