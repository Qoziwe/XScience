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
          // §6.5 — панель доступна только с живой сессией; без неё — на вход.
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
