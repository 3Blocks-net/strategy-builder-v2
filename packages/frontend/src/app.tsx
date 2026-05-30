import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { WalletProvider } from '@/providers/wallet-provider';
import { ConnectPage } from '@/pages/connect';
import { DashboardPage } from '@/pages/dashboard';

export function App() {
  return (
    <WalletProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/connect" element={<ConnectPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="*" element={<Navigate to="/connect" replace />} />
        </Routes>
      </BrowserRouter>
    </WalletProvider>
  );
}
