import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { Toaster } from 'sonner';
import { WalletProvider } from '@/providers/wallet-provider';
import { AuthProvider } from '@/providers/auth-context';
import { DeploymentConfigProvider } from '@/providers/deployment-config';
import { ProtectedRoute } from '@/components/protected-route';
import { DeploymentConfigGate } from '@/components/deployment-config-gate';
import { ConnectPage } from '@/pages/connect';
import { DiscoveryPage } from '@/pages/discovery';
import { DashboardPage } from '@/pages/dashboard';
import { CreateVaultPage } from '@/pages/vault/create';
import { VaultDetailPage } from '@/pages/vault/detail';
import { AutomationEditorPage } from '@/features/automation-editor/editor-page';

export function App() {
  return (
    <WalletProvider>
      {/* Asks the backend once, at start-up, which contracts it works with
          (#31) — so a redeploy needs a page reload, not an edited .env file.
          Screens that act on an address stand behind DeploymentConfigGate. */}
      <DeploymentConfigProvider>
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<DiscoveryPage />} />
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
                    <DeploymentConfigGate>
                      <CreateVaultPage />
                    </DeploymentConfigGate>
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
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </DeploymentConfigProvider>
      <Toaster position="top-right" richColors />
    </WalletProvider>
  );
}
