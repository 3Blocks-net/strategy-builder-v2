import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { toast } from 'sonner';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

/**
 * Live execution updates for one vault (PEC-219 #06).
 *
 * - Connects to the `/executions` namespace with the JWT supplied via the
 *   **function form** so a token refreshed mid-session is read fresh on every
 *   reconnect (no expired-token reconnect loop).
 * - Re-subscribes to the vault room on every connect/reconnect.
 * - On a received success event: a toast + `onExecution()` (the table refetches
 *   page 1 → the new row shows and any just-resolved failure flips to resolved).
 * - On every connect/reconnect: `onExecution()` too, to fill the gap of events
 *   missed while disconnected (Socket.IO does not replay).
 * - StrictMode-guarded: a single socket per mount, cleaned up on unmount.
 *
 * `onExecution` is read through a ref so the socket is not torn down when the
 * callback identity changes between renders.
 */
export function useExecutionsSocket(
  vaultAddress: string | undefined,
  onExecution: () => void,
): { connected: boolean } {
  const cbRef = useRef(onExecution);
  cbRef.current = onExecution;

  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!vaultAddress) return;
    if (socketRef.current) return; // StrictMode double-invoke guard

    const socket = io(`${API_URL}/executions`, {
      transports: ['websocket'],
      auth: (cb) => cb({ token: localStorage.getItem('accessToken') ?? '' }),
    });
    socketRef.current = socket;

    const subscribeAndSync = () => {
      setConnected(true);
      socket.emit('subscribe', { vaultAddress });
      cbRef.current(); // fill any gap missed while disconnected
    };
    const onDisconnect = () => setConnected(false);

    socket.on('connect', subscribeAndSync);
    socket.on('disconnect', onDisconnect);
    socket.on('execution', (payload: { automationId?: number }) => {
      toast.success(
        payload?.automationId != null
          ? `Automation #${payload.automationId} executed`
          : 'Automation executed',
      );
      cbRef.current();
    });

    return () => {
      socket.off('connect', subscribeAndSync);
      socket.off('disconnect', onDisconnect);
      socket.removeAllListeners('execution');
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [vaultAddress]);

  return { connected };
}
