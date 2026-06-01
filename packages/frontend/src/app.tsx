import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { WalletProvider } from '@/providers/wallet-provider';
import { AuthProvider } from '@/providers/auth-context';
import { ProtectedRoute } from '@/components/protected-route';
import { ConnectPage } from '@/pages/connect';
import { DashboardPage } from '@/pages/dashboard';
import { CreateVaultPage } from '@/pages/vault/create';
import { VaultDetailPage } from '@/pages/vault/detail';
import { AutomationEditorPage } from '@/features/automation-editor/editor-page';

export function App() {
  return (
    <WalletProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/connect" element={<ConnectPage />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/vault/create"
              element={
                <ProtectedRoute>
                  <CreateVaultPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/vault/:address"
              element={
                <ProtectedRoute>
                  <VaultDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/vault/:address/automation/new/edit"
              element={
                <ProtectedRoute>
                  <AutomationEditorPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/vault/:address/automation/:id/edit"
              element={
                <ProtectedRoute>
                  <AutomationEditorPage />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/connect" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </WalletProvider>
  );
}
