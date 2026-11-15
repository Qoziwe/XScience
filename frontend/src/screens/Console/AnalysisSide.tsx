/** Sidebar of the "Analysis" tab. FUNCTIONAL_SPEC.md §9.8. */
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
          <CardHead title="Calculation Assumptions" kicker={String(r.notes.length)} />
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

      {/* Run history — always visible. */}
      <Card>
        <header className="card__head">
          <h2 className="card__title">Run History</h2>
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
                  {/* Dot colored by RISK LEVEL, not the verdict (§9.8). */}
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
                      {SEC[h.sector].code} · {MAT[h.p.material].label} {f1(h.p.thickness)} mm · O₂{' '}
                      {f1(h.p.o2)} · {f1(h.p.flow)} cm/s · {gravityShort(h.p.gravity)}
                    </span>
                  </span>
                </button>
              ))
          ) : (
            <div className="card__foot">No runs yet.</div>
          )}
        </div>
        <div className="card__foot">
          Stored in this browser. Storage location is unspecified (16.12).
        </div>
      </Card>
    </div>
  );
}

/** §9.8.1 — material card. [QUESTION 16.11] draft. */
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
        right={<span className="notice notice--draft">draft · 16.11</span>}
      />
      <div className="card__body">
        <p style={{ margin: 0, fontSize: 13 }}>{card.body}</p>
        <div>
          {card.facts.map(([k, v]) => (
            <KeyValue
              key={k}
              k={k}
              v={
                r.entry.p.material === 'other' && k === 'Description'
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
