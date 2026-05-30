import { useState } from 'react';
import { useAuth } from '@/providers/auth-context';
import { Button } from '@/components/ui/button';

export function DashboardPage() {
  const { address, logout } = useAuth();
  const [copied, setCopied] = useState(false);

  const truncated = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : '';

  const copyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="mx-auto w-full max-w-sm space-y-6 text-center">
        <h1 className="text-3xl font-bold">Dashboard</h1>

        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Connected wallet</p>
          <div className="flex items-center justify-center gap-2">
            <code className="rounded bg-secondary px-3 py-1.5 text-sm font-mono">
              {truncated}
            </code>
            <Button variant="outline" size="sm" onClick={copyAddress}>
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          </div>
        </div>

        <Button variant="ghost" onClick={logout}>
          Disconnect
        </Button>
      </div>
    </div>
  );
}
