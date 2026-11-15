/**
 * Console route guard. FUNCTIONAL_SPEC.md §6.5.
 * While the session is being checked — nothing on screen but the label; without a
 * session — redirect back to login. In VITE_API=local mode the session is stored
 * in localStorage, so the prototype stays accessible after a reload.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '@/api';

type Status = 'checking' | 'ok' | 'none';

export function RequireSession({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('checking');

  useEffect(() => {
    let alive = true;
    api.auth
      .me()
      .then((user) => alive && setStatus(user ? 'ok' : 'none'))
      .catch(() => alive && setStatus('none'));
    return () => {
      alive = false;
    };
  }, []);

  if (status === 'checking') {
    return (
      <div className="login">
        <span className="muted" style={{ margin: 'auto', fontSize: 13 }}>
          Checking session…
        </span>
      </div>
    );
  }
  if (status === 'none') return <Navigate to="/login" replace />;
  return <>{children}</>;
}
