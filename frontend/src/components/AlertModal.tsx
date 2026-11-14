/** Окно оповещения и окно рекомендаций. FUNCTIONAL_SPEC.md §10. */
import { DANGER_BG, VERDICT_RU, WARN_BG, WARN_BTN, WARN_INK, SEC, sentFull } from '@/domain/reference';
import { reportNo } from '@/domain/format';
import { useStore } from '@/state/store';
import { useModalModel } from '@/state/useResult';
import { Tile } from './ui';

const ALERT_TITLE = { high: 'ОПАСНОСТЬ', medium: 'ВНИМАНИЕ' } as const;
const ALERT_SUB = {
  high: 'Обнаружены опасные значения. Требуются немедленные действия.',
  medium: 'Обнаружены повышенные значения. Требуется контроль и устранение ведущего фактора.',
} as const;

export function AlertModal() {
  const { dispatch } = useStore();
  const m = useModalModel();
  if (!m) return null;

  const { entry, scores, view, why, recs } = m;
  const sec = SEC[entry.sector];
  const high = entry.v === 'high';

  // §10.2 — шапка по вердикту; у вида «Рекомендации» low получает тёмно-синюю шапку.
  const headBg = high ? DANGER_BG : entry.v === 'medium' ? WARN_BG : 'var(--color-accent-800)';
  const headInk = entry.v === 'medium' ? WARN_INK : '#fff';
  const primaryBg = high ? DANGER_BG : entry.v === 'medium' ? WARN_BTN : 'var(--color-accent-700)';

  const close = () => dispatch({ type: 'modal', modal: null });
  const openReport = () => {
    dispatch({ type: 'repId', id: entry.id });
    dispatch({ type: 'tab', tab: 'reports' });
    dispatch({ type: 'modal', modal: null });
  };

  // Нажатие на фон окно не закрывает (§10.2); закрывает только Esc и кнопки.
  return (
    <div className="backdrop" role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-label={`Сектор ${sec.code}`}>
        <div className="modal__head" style={{ background: headBg, color: headInk }}>
          <span className="modal__sector">
            Сектор {sec.code} · {sec.name}
          </span>
          {view === 'alert' ? (
            <>
              <div
                className={`modal__title modal__title--${high ? 'high' : 'medium'}`}
              >
                {ALERT_TITLE[high ? 'high' : 'medium']}
              </div>
              <div className="modal__sub">{ALERT_SUB[high ? 'high' : 'medium']}</div>
            </>
          ) : (
            <div className="modal__title modal__title--recs">
              {high ? 'ОПАСНОСТЬ' : entry.v === 'medium' ? 'ВНИМАНИЕ' : VERDICT_RU.low}
            </div>
          )}
        </div>

        <div className="modal__body">
          {view === 'alert' ? (
            <>
              <p style={{ margin: 0, fontSize: 13.5 }}>{why}</p>
              <div className="modal__tiles">
                <Tile k="RiskScore" v={`${scores.risk} / 16`} />
                <Tile k="ExtinctionScore" v={`${scores.ext} / 8`} />
                <Tile k="Уверенность" v={`${entry.conf} %`} />
              </div>
            </>
          ) : (
            <>
              <h3 style={{ fontSize: 17 }}>Рекомендации по нейтрализации</h3>
              <p style={{ margin: 0, fontSize: 13 }} className="muted">
                {recs.intro}
              </p>
              <div className="steps">
                {recs.steps.map((s, i) => (
                  <div className={`step${i === 0 ? ' step--first' : ''}`} key={s.n}>
                    <span className="step__n">{s.n}</span>
                    <div>
                      <div className="step__title">{s.title}</div>
                      <div className="step__detail">{s.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="notice">
            Отчёт {reportNo(entry.id)}: {sentFull(entry.sent)}
          </div>
        </div>

        <div className="modal__foot">
          {view === 'alert' ? (
            <>
              <button
                type="button"
                className="btn btn--primary"
                style={{ background: primaryBg, borderColor: primaryBg }}
                onClick={() => dispatch({ type: 'modalView', view: 'recs' })}
              >
                Открыть рекомендации
              </button>
              <button type="button" className="btn" onClick={close}>
                Закрыть
              </button>
            </>
          ) : (
            <>
              {/* [ПРОТОТИП] «Принято» ничего не записывает. [БЭКЕНД] POST /api/analyses/{id}/ack. */}
              <button
                type="button"
                className="btn btn--primary"
                style={{ background: primaryBg, borderColor: primaryBg }}
                onClick={close}
              >
                Принято
              </button>
              <button type="button" className="btn" onClick={openReport}>
                Открыть отчёт
              </button>
            </>
          )}
          <span className="card__spacer kbd muted" style={{ alignSelf: 'center' }}>
            Esc — закрыть
          </span>
        </div>
      </div>
    </div>
  );
}
