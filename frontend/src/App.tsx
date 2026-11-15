import { Navigate, Route, Routes } from 'react-router-dom';
import { StoreProvider } from '@/state/store';
import { ConsolePage } from '@/screens/Console/ConsolePage';

export function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <StoreProvider>
            <ConsolePage />
          </StoreProvider>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
