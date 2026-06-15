const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

let onTokenExpiredAndRefreshFailed: (() => void) | null = null;

export function setOnAuthFailure(cb: () => void) {
  onTokenExpiredAndRefreshFailed = cb;
}

export async function apiFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const accessToken = localStorage.getItem('accessToken');
  const headers = new Headers(init?.headers);
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }
  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json');
  }

  let res = await fetch(`${API_URL}${path}`, { ...init, headers });

  if (res.status === 401) {
    const body = await res.json().catch(() => ({}));
    if (body.message === 'TOKEN_EXPIRED') {
      const refreshed = await silentRefresh();
      if (refreshed) {
        headers.set(
          'Authorization',
          `Bearer ${localStorage.getItem('accessToken')}`,
        );
        res = await fetch(`${API_URL}${path}`, { ...init, headers });
      } else {
        onTokenExpiredAndRefreshFailed?.();
      }
    }
  }

  return res;
}

async function silentRefresh(): Promise<boolean> {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) return false;

    const { accessToken } = await res.json();
    localStorage.setItem('accessToken', accessToken);
    return true;
  } catch {
    return false;
  }
}

export async function fetchNonce(): Promise<string> {
  const res = await fetch(`${API_URL}/auth/nonce`);
  const { nonce } = await res.json();
  return nonce;
}

export async function verifySignature(
  message: string,
  signature: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await fetch(`${API_URL}/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, signature }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? 'Verification failed');
  }

  return res.json();
}
