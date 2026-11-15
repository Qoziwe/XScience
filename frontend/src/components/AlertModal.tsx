/** Alert window and recommendations window. FUNCTIONAL_SPEC.md §10. */
import { useState } from 'react';
import { api } from '@/api';
import { DANGER_BG, VERDICT_RU, WARN_BG, WARN_BTN, WARN_INK, SEC, sentFull } from '@/domain/reference';
import { reportNo } from '@/domain/format';
import { useStore } from '@/state/store';
import { useModalModel } from '@/state/useResult';
import { Tile } from './ui';

const ALERT_TITLE = { high: 'DANGER', medium: 'WARNING' } as const;
const ALERT_SUB = {
  high: 'Dangerous values detected. Immediate action required.',
  medium: 'Elevated values detected. Monitoring and removal of the leading factor required.',
} as const;

export function AlertModal() {
  const { dispatch } = useStore();
  const [acking, setAcking] = useState(false);
  const m = useModalModel();
  if (!m) return null;

  const { entry, scores, view, why, recs } = m;
  const sec = SEC[entry.sector];
  const high = entry.v === 'high';

  // §10.2 — header color follows the verdict; in "Recommendations" view, low gets a dark blue header.
  const headBg = high ? DANGER_BG : entry.v === 'medium' ? WARN_BG : 'var(--color-accent-800)';
  const headInk = entry.v === 'medium' ? WARN_INK : '#fff';
  const primaryBg = high ? DANGER_BG : entry.v === 'medium' ? WARN_BTN : 'var(--color-accent-700)';

  const close = () => dispatch({ type: 'modal', modal: null });

  /**
   * §10.2 — "Acknowledged". The acknowledgment is sent to the server; the window
   * closes regardless, so a network failure doesn't trap the operator in the modal.
   */
  const accept = async () => {
    setAcking(true);
    try {
      await api.analyses.ack(entry.id);
    } catch {
      /* the acknowledgment isn't critical: the verdict and report are already saved */
    } finally {
      setAcking(false);
      close();
    }
  };
  const openReport = () => {
    dispatch({ type: 'repId', id: entry.id });
    dispatch({ type: 'tab', tab: 'reports' });
    dispatch({ type: 'modal', modal: null });
  };

  // Clicking the backdrop does not close the window (§10.2); only Esc and buttons do.
  return (
    <div className="backdrop" role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-label={`Sector ${sec.code}`}>
        <div className="modal__head" style={{ background: headBg, color: headInk }}>
          <span className="modal__sector">
            Sector {sec.code} · {sec.name}
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
              {high ? 'DANGER' : entry.v === 'medium' ? 'WARNING' : VERDICT_RU.low}
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
                <Tile k="Confidence" v={`${entry.conf} %`} />
              </div>
            </>
          ) : (
            <>
              <h3 style={{ fontSize: 17 }}>Neutralization Recommendations</h3>
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
            Report {reportNo(entry.id)}: {sentFull(entry.sent)}
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
                Open Recommendations
              </button>
              <button type="button" className="btn" onClick={close}>
                Close
              </button>
            </>
          ) : (
            <>
              {/* §10.2 — operator acknowledgment is sent to the server (ack). */}
              <button
                type="button"
                className="btn btn--primary"
                style={{ background: primaryBg, borderColor: primaryBg }}
                disabled={acking}
                onClick={accept}
              >
                {acking ? 'Sending…' : 'Acknowledge'}
              </button>
              <button type="button" className="btn" onClick={openReport}>
                Open Report
              </button>
            </>
          )}
          <span className="card__spacer kbd muted" style={{ alignSelf: 'center' }}>
            Esc — close
          </span>
        </div>
      </div>
    </div>
  );
}
