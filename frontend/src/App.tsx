import { Navigate, Route, Routes } from 'react-router-dom';
import { StoreProvider } from '@/state/store';
import { RequireSession } from '@/components/RequireSession';
import { LoginPage } from '@/screens/Login/LoginPage';
import { ConsolePage } from '@/screens/Console/ConsolePage';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/console"
        element={
          // §6.5 — the console is only accessible with a live session; otherwise, redirect to login.
          <RequireSession>
            <StoreProvider>
              <ConsolePage />
            </StoreProvider>
          </RequireSession>
        }
      />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
