import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Execution } from '@prisma/client';
import { getAddress } from 'ethers';
import { VaultAccessService } from '../vault/vault-access.service';
import { ExecutionEventsPort } from './execution-events.port';

const room = (vaultAddress: string) => `vault:${getAddress(vaultAddress)}`;

/**
 * Real-time execution gateway (PEC-219 #06) — the no-data-leak boundary.
 *
 * Two auth layers: (1) the handshake JWT is verified in `handleConnection` (the
 * global HTTP `APP_GUARD` does NOT protect gateways); (2) joining a per-vault
 * room runs the SAME ownership check as `VaultOwnerGuard` via the shared
 * `VaultAccessService`. The indexer calls `emitNewExecutions` in-process after
 * persisting SUCCESS rows; only the owning vault's room receives them.
 */
@WebSocketGateway({
  namespace: '/executions',
  cors: { origin: process.env.FRONTEND_URL ?? true, credentials: true },
})
export class ExecutionsGateway implements OnGatewayConnection, ExecutionEventsPort {
  private readonly logger = new Logger(ExecutionsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly access: VaultAccessService,
  ) {}

  handleConnection(client: Socket): void {
    const token = client.handshake.auth?.token as string | undefined;
    try {
      const payload = this.jwt.verify(token ?? '');
      client.data.address = payload.sub as string;
    } catch {
      client.disconnect(true); // unauthenticated — drop the socket
    }
  }

  @SubscribeMessage('subscribe')
  async onSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { vaultAddress?: string },
  ): Promise<{ subscribed: string }> {
    const address = client.data.address as string | undefined;
    try {
      const vault = await this.access.assertOwnership(body?.vaultAddress, address);
      const r = room(vault.address);
      await client.join(r);
      return { subscribed: r };
    } catch {
      // Do not leak whether the vault exists vs. is owned by someone else.
      throw new WsException('SUBSCRIBE_REJECTED');
    }
  }

  /** Called in-process by the indexer after persisting new SUCCESS rows. */
  emitNewExecutions(vaultAddress: string, executions: Execution[]): void {
    if (!this.server) return;
    const target = room(vaultAddress);
    for (const e of executions) {
      this.server.to(target).emit('execution', {
        vaultAddress: getAddress(vaultAddress),
        automationId: e.automationId,
        txHash: e.txHash,
        status: 'success',
        gasCompPaid: e.gasCompAmount,
        gasCompUsd: e.gasCompUsd,
        timestamp: e.blockTimestamp,
      });
    }
  }
}
