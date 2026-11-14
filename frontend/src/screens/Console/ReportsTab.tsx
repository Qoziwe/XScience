/** Вкладка «Отчёты». FUNCTIONAL_SPEC.md §11. */
import { DOT, SEC, VERDICT_RU, sentShort } from '@/domain/reference';
import { reportDoc, reportTxt } from '@/domain/report';
import { useStore } from '@/state/store';
import { Card, CardHead, Dot, KeyValue } from '@/components/ui';
import { download } from '@/lib/download';

export function ReportsTab() {
  const { state, dispatch } = useStore();
  const { repId } = state;
  // [ПРОТОТИП] показания имитации датчиков между отчётными кругами не
  // заводят отчёт (hasReport=false) — вкладка их не показывает, иначе список
  // заполнялся бы каждые 30 с. У обычных анализов hasReport всегда true.
  const hist = state.hist.filter((h) => h.hasReport !== false);

  // Выбранный по умолчанию — последний (§11.1).
  const selected = hist.find((h) => h.id === repId) ?? hist[hist.length - 1] ?? null;
  const doc = selected ? reportDoc(selected) : null;

  return (
    <main className="main">
      <div className="rep-side">
        <Card>
          <CardHead title="Отчёты для Земли" kicker={String(hist.length)} />
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
                    aria-current={selected?.id === h.id}
                    onClick={() => dispatch({ type: 'repId', id: h.id })}
                  >
                    <Dot color={DOT[h.v]} />
                    <span className="list__col">
                      <span className="list__top">
                        <span>RPT-{String(h.id).padStart(4, '0')}</span>
                        <span className="muted">{h.ts}</span>
                      </span>
                      <span className="list__sub">
                        {VERDICT_RU[h.v]} · {SEC[h.sector].code} · {SEC[h.sector].name} ·{' '}
                        {sentShort(h.sent)}
                      </span>
                    </span>
                  </button>
                ))
            ) : (
              <div className="card__foot">
                Отчёт создаётся автоматически при каждом анализе.
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="rep-main">
        {doc ? (
          <Card>
            <header className="card__head">
              <h2 className="card__title">Отчёт {doc.no}</h2>
              <span className="card__kicker">{doc.title}</span>
              <span className="chip" aria-pressed={false} style={{ cursor: 'default' }}>
                <Dot color={DOT[doc.verdictKey]} />
                {doc.verdict}
              </span>
              <span className="card__spacer">
                <button
                  type="button"
                  className="btn"
                  onClick={() => download(`${doc.no}.txt`, reportTxt(doc))}
                >
                  Скачать TXT
                </button>
              </span>
            </header>

            <div className="card__body">
              <div>
                {doc.meta.map((m) => (
                  <KeyValue key={m.k} k={m.k} v={m.v} />
                ))}
              </div>

              {doc.sections.map((s) => (
                <section key={s.h}>
                  <h3 style={{ fontSize: 13, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    {s.h}
                  </h3>
                  <p style={{ margin: '4px 0 0', fontSize: 13 }}>{s.t}</p>
                </section>
              ))}

              <section>
                <h3 style={{ fontSize: 13, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Рекомендации
                </h3>
                <p className="muted" style={{ margin: '4px 0 12px', fontSize: 13 }}>
                  {doc.intro}
                </p>
                <div className="steps">
                  {doc.steps.map((s) => (
                    <div className="step" key={s.n}>
                      <span className="step__n">{s.n}</span>
                      <div>
                        <div className="step__title">{s.title}</div>
                        <div className="step__detail">{s.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </Card>
        ) : (
          <Card>
            <CardHead title="Отчётов пока нет" />
            <div className="card__body">
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                Запустите анализ в одном из секторов.
              </p>
            </div>
          </Card>
        )}
      </div>
    </main>
  );
}
