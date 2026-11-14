/** Вкладка «Данные». FUNCTIONAL_SPEC.md §12. */
import {
  ALERT_INK,
  ALERT_TINT,
  EXT_LEVEL_RU,
  MATERIALS,
  MAT,
  RISK_LEVEL_RU,
  signalOf,
} from '@/domain/reference';
import { f1 } from '@/domain/format';
import { DATASET, DATASET_MISMATCHES } from '@/domain/dataset';
import { toForm } from '@/domain/validation';
import { useStore } from '@/state/store';
import { Card, CardHead, Dot, Tile } from '@/components/ui';

export function DataTab() {
  const { state, dispatch } = useStore();
  const { dsMat, dsMismatchOnly, tweaks } = state;

  const rows = DATASET.filter(
    (r) => (dsMat === 'all' || r.p.material === dsMat) && (!dsMismatchOnly || !r.ok),
  );

  return (
    <main className="main">
      <div className="stack">
        <Card>
          <CardHead
            title="Набор данных"
            kicker="simulated_rule_based · значения из файла, расчёт — только для сверки"
          />
          <div className="card__body">
            <div className="tiles" style={{ gridTemplateColumns: 'repeat(5, minmax(0,1fr))' }}>
              <Tile k="строк · цель 50–100" v="30" />
              <Tile k="строк с gravity = earth" v="0" />
              <Tile k="класс risk_level (только high)" v="1" />
              <Tile
                k="расхождения с формулами"
                v={String(DATASET_MISMATCHES)}
                color={DATASET_MISMATCHES ? ALERT_INK : undefined}
              />
              <Tile k="недопустимый data_source" v="30" color={ALERT_INK} />
            </div>

            <div className="chip-row">
              <button
                type="button"
                className="chip"
                aria-pressed={dsMat === 'all'}
                onClick={() => dispatch({ type: 'dsMat', mat: 'all' })}
              >
                Все
              </button>
              {MATERIALS.filter((m) => m.code !== 'other').map((m) => (
                <button
                  key={m.code}
                  type="button"
                  className="chip"
                  aria-pressed={dsMat === m.code}
                  onClick={() => dispatch({ type: 'dsMat', mat: m.code })}
                >
                  {m.label}
                </button>
              ))}
              <button
                type="button"
                className="chip"
                aria-pressed={dsMismatchOnly}
                onClick={() => dispatch({ type: 'toggleMismatch' })}
              >
                Только расхождения с расчётом
              </button>
              <span className="card__spacer muted mono" style={{ fontSize: 12 }}>
                показано {rows.length} из {DATASET.length}
              </span>
            </div>
          </div>

          <div className="table-wrap">
            <table className="table table--dataset">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Материал</th>
                  <th>мм</th>
                  <th>O₂ %</th>
                  <th>см/с</th>
                  <th>°C</th>
                  <th>с</th>
                  <th>Пламя (см)</th>
                  <th>Скор. (см/с)</th>
                  <th>Риск</th>
                  <th>Затухание</th>
                  <th>Результат</th>
                  <th>Сверка</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.n} style={r.ok ? undefined : { background: ALERT_TINT }}>
                    <td className="mono">{r.n}</td>
                    <td>{MAT[r.p.material].label}</td>
                    <td className="num-cell">{f1(r.p.thickness)}</td>
                    <td className="num-cell">{r.p.o2}</td>
                    <td className="num-cell">{r.p.flow}</td>
                    <td className="num-cell">{r.p.temp}</td>
                    <td className="num-cell">{r.p.time}</td>
                    <td className="num-cell">{r.size}</td>
                    <td className="num-cell">{r.rate}</td>
                    <td>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <Dot color={signalOf(r.risk, tweaks.palette).fill} />
                        {RISK_LEVEL_RU[r.risk].toLowerCase()}
                      </span>
                    </td>
                    <td>{EXT_LEVEL_RU[r.ext].toLowerCase()}</td>
                    <td className="mono" style={{ fontSize: 11.5 }}>
                      {r.res}
                    </td>
                    <td style={{ fontSize: 12, color: r.ok ? 'var(--color-neutral-700)' : ALERT_INK }}>
                      {r.ok
                        ? 'совпадает'
                        : `по формулам: затухание ${EXT_LEVEL_RU[r.s.extLevel].toLowerCase()} (E=${r.s.ext})`}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {/* Сектор не меняется, анализ не запускается (§12). */}
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          dispatch({ type: 'loadForm', form: toForm(r.p) });
                          dispatch({ type: 'tab', tab: 'analysis' });
                        }}
                      >
                        В форму →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </main>
  );
}
