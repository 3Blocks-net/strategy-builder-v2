import { Navigate } from 'react-router';
import { useAuth } from '@/providers/auth-context';
import type { ReactNode } from 'react';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to="/connect" replace />;

  return <>{children}</>;
}
