/** Шапка панели. FUNCTIONAL_SPEC.md §5.1. */
import { useNavigate } from 'react-router-dom';
import { api } from '@/api';
import { useStore, type Tab } from '@/state/store';
import { shipStatus } from '@/domain/ship';
import { DOT } from '@/domain/reference';
import { Dot } from '@/components/ui';

const MAIN_TABS: [Tab, string][] = [
  ['overview', 'Обзор'],
  ['map', 'Карта'],
  ['analysis', 'Анализ'],
  ['reports', 'Отчёты'],
];

const REF_TABS: [Tab, string][] = [
  ['data', 'Данные'],
  ['rules', 'Правила'],
  ['models', 'Модели'],
];

export function Header({ user }: { user: string }) {
  const { state, dispatch, toggleSensors } = useStore();
  const navigate = useNavigate();
  const { enabled, manualOverride } = state.sensors;
  const ship = shipStatus(state.hist);
  const dangerCount = ship.dangers.length;
  // [ПРОТОТИП] счётчик вкладки «Отчёты» — как и сама вкладка, без показаний
  // имитации датчиков между отчётными кругами (hasReport=false).
  const reportCount = state.hist.filter((h) => h.hasReport !== false).length;

  const countFor = (tab: Tab): { text: string; danger: boolean } | null => {
    if (tab === 'overview' && dangerCount) return { text: `${dangerCount} опасн.`, danger: true };
    if (tab === 'reports' && reportCount) return { text: String(reportCount), danger: false };
    return null;
  };

  const logout = async () => {
    // [ПРОТОТИП] сессия не завершается. [БЭКЕНД] POST /api/auth/logout.
    await api.auth.logout();
    navigate('/login');
  };

  return (
    <header className="header">
      <div className="brand">
        <div className="brand__mark">X</div>
        <div className="brand__text">
          <span className="brand__name">XScience</span>
          <span className="brand__sub">Пожарная обстановка · микрогравитация</span>
        </div>
      </div>

      <nav className="tabs" aria-label="Основные вкладки">
        {MAIN_TABS.map(([tab, label]) => {
          const c = countFor(tab);
          return (
            <button
              key={tab}
              type="button"
              className="tab"
              aria-current={state.tab === tab ? 'page' : undefined}
              onClick={() => dispatch({ type: 'tab', tab })}
            >
              <span>{label}</span>
              {c ? (
                <span className={`tab__count${c.danger ? ' tab__count--danger' : ''}`}>
                  {c.text}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <nav className="tabs-ref" aria-label="Справочные вкладки">
        {REF_TABS.map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            className="tab-ref"
            aria-current={state.tab === tab ? 'page' : undefined}
            onClick={() => dispatch({ type: 'tab', tab })}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="header__right">
        <span className="sensors">
          <Dot color={enabled ? DOT.low : DOT.none} />
          {enabled
            ? `Датчики активны · ${manualOverride ? 'ручной ввод' : 'авто'}`
            : 'Датчики не подключены · ручной ввод'}
        </span>
        {api.sensors ? (
          <div className="seg" role="group" aria-label="Имитация датчиков">
            <button
              type="button"
              className="seg__opt"
              aria-pressed={!enabled}
              onClick={() => toggleSensors(false)}
            >
              Выкл
            </button>
            <button
              type="button"
              className="seg__opt"
              aria-pressed={enabled}
              onClick={() => toggleSensors(true)}
            >
              Вкл
            </button>
          </div>
        ) : null}
        <button type="button" className="logout" onClick={logout}>
          {user} · Выход
        </button>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <span>
        Прототип для обучения и исследований. Не является сертифицированным средством пожарной
        безопасности.
      </span>
      <span>Диапазоны NASA не проверены (16.13)</span>
    </footer>
  );
}
