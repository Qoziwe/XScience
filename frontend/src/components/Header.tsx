/** Console header. FUNCTIONAL_SPEC.md §5.1. */
import { api } from '@/api';
import { useStore, type Tab } from '@/state/store';
import { shipStatus } from '@/domain/ship';
import { DOT } from '@/domain/reference';
import { Dot } from '@/components/ui';

const MAIN_TABS: [Tab, string][] = [
  ['overview', 'Overview'],
  ['map', 'Map'],
  ['analysis', 'Analysis'],
  ['reports', 'Reports'],
];

const REF_TABS: [Tab, string][] = [
  ['data', 'Data'],
  ['rules', 'Rules'],
  ['models', 'Models'],
];

export function Header() {
  const { state, dispatch, toggleSensors } = useStore();
  const { enabled, manualOverride } = state.sensors;
  const ship = shipStatus(state.hist);
  const dangerCount = ship.dangers.length;
  // [PROTOTYPE] "Reports" tab counter — like the tab itself, it has no readings
  // from the sensor simulation between reporting cycles (hasReport=false).
  const reportCount = state.hist.filter((h) => h.hasReport !== false).length;

  const countFor = (tab: Tab): { text: string; danger: boolean } | null => {
    if (tab === 'overview' && dangerCount) return { text: `${dangerCount} danger`, danger: true };
    if (tab === 'reports' && reportCount) return { text: String(reportCount), danger: false };
    return null;
  };

  return (
    <header className="header">
      <div className="brand">
        <div className="brand__mark">X</div>
        <div className="brand__text">
          <span className="brand__name">XScience</span>
          <span className="brand__sub">Fire situation · microgravity</span>
        </div>
      </div>

      <nav className="tabs" aria-label="Main tabs">
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

      <nav className="tabs-ref" aria-label="Reference tabs">
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
            ? `Sensors active · ${manualOverride ? 'manual input' : 'auto'}`
            : 'Sensors not connected · manual input'}
        </span>
        {api.sensors ? (
          <div className="seg" role="group" aria-label="Sensor simulation">
            <button
              type="button"
              className="seg__opt"
              aria-pressed={!enabled}
              onClick={() => toggleSensors(false)}
            >
              Off
            </button>
            <button
              type="button"
              className="seg__opt"
              aria-pressed={enabled}
              onClick={() => toggleSensors(true)}
            >
              On
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <span>
        Prototype for training and research purposes. Not a certified fire safety
        instrument.
      </span>
      <span>NASA ranges not verified (16.13)</span>
    </footer>
  );
}
