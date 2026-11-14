/** Боковая панель вкладки «Анализ». FUNCTIONAL_SPEC.md §9.8. */
import { MAT, SEC, gravityShort, signalOf } from '@/domain/reference';
import { f1, pad } from '@/domain/format';
import { historyCsv } from '@/domain/report';
import { MATERIAL_CARDS } from '@/domain/texts';
import { useStore } from '@/state/store';
import { useResult } from '@/state/useResult';
import { Card, CardHead, Dot, KeyValue } from '@/components/ui';
import { download } from '@/lib/download';

export function AnalysisSide() {
  const { state, dispatch } = useStore();
  const { hist, activeId, running, tweaks } = state;
  const r = useResult();

  return (
    <div className="stack">
      {r ? <MaterialCard /> : null}
      {r ? (
        <Card>
          <CardHead title="Допущения расчёта" kicker={String(r.notes.length)} />
          <div className="card__body">
            {r.notes.map((n, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12.5 }}>
                <span className="mono muted" style={{ flex: 'none', width: 34 }}>
                  {n.ref}
                </span>
                <span>{n.text}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {/* История запусков — видна всегда. */}
      <Card>
        <header className="card__head">
          <h2 className="card__title">История запусков</h2>
          <span className="mono muted" style={{ fontSize: 12 }}>
            {hist.length}
          </span>
          <span className="card__spacer">
            <button
              type="button"
              className="btn"
              disabled={!hist.length}
              onClick={() => download('xscience_history.csv', historyCsv(hist), 'text/csv')}
            >
              CSV
            </button>
          </span>
        </header>
        <div className="list">
          {hist.length ? (
            hist
              .slice()
              .reverse()
              .map((h) => (
                <button
                  key={h.id}
                  type="button"
                  className="list__row"
                  aria-current={h.id === activeId}
                  disabled={running}
                  onClick={() => dispatch({ type: 'openAnalysis', entry: h })}
                >
                  {/* Точка цвета УРОВНЯ РИСКА, не вердикта (§9.8). */}
                  <Dot color={signalOf(h.level, tweaks.palette).fill} />
                  <span className="list__col">
                    <span className="list__top">
                      <span>#{pad(h.id)}</span>
                      <span className="muted">{h.ts}</span>
                      <span className="muted">
                        R{h.risk} · E{h.ext}
                      </span>
                    </span>
                    <span className="list__sub">
                      {SEC[h.sector].code} · {MAT[h.p.material].label} {f1(h.p.thickness)} мм · O₂{' '}
                      {f1(h.p.o2)} · {f1(h.p.flow)} см/с · {gravityShort(h.p.gravity)}
                    </span>
                  </span>
                </button>
              ))
          ) : (
            <div className="card__foot">Запусков пока не было.</div>
          )}
        </div>
        <div className="card__foot">
          Хранится в этом браузере. Место хранения не определено (16.12).
        </div>
      </Card>
    </div>
  );
}

/** §9.8.1 — карточка материала. [ВОПРОС 16.11] черновик. */
function MaterialCard() {
  const r = useResult();
  if (!r) return null;
  const m = MAT[r.entry.p.material];
  const card = MATERIAL_CARDS[r.entry.p.material];
  return (
    <Card>
      <CardHead
        title={m.label}
        kicker={`MaterialRisk ${m.risk} / 3`}
        right={<span className="notice notice--draft">черновик · 16.11</span>}
      />
      <div className="card__body">
        <p style={{ margin: 0, fontSize: 13 }}>{card.body}</p>
        <div>
          {card.facts.map(([k, v]) => (
            <KeyValue
              key={k}
              k={k}
              v={
                r.entry.p.material === 'other' && k === 'Описание'
                  ? r.entry.p.desc || '—'
                  : v
              }
            />
          ))}
        </div>
      </div>
    </Card>
  );
}
