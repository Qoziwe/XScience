/**
 * Защита маршрута панели. FUNCTIONAL_SPEC.md §6.5.
 * Пока сессия проверяется — на экране ничего, кроме надписи; без сессии —
 * возврат на вход. В режиме VITE_API=local сессия хранится в localStorage,
 * поэтому прототип после перезагрузки остаётся доступным.
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
          Проверка сессии…
        </span>
      </div>
    );
  }
  if (status === 'none') return <Navigate to="/login" replace />;
  return <>{children}</>;
}
