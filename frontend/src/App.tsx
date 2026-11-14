import { Navigate, Route, Routes } from 'react-router-dom';
import { StoreProvider } from '@/state/store';
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
          <StoreProvider>
            <ConsolePage />
          </StoreProvider>
        }
      />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
