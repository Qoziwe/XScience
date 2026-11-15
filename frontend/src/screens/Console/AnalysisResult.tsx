/** Result on the "Analysis" tab. FUNCTIONAL_SPEC.md §9.6, §9.7. */
import {
  DOT,
  EXT_LEVEL_RU,
  FIELD_NAMES,
  FIELD_ORDER,
  MAT,
  RISK_LEVEL_RU,
  SEC,
  UNITS,
  VERDICT_RU,
  VERDICT_SUBTITLE,
  gravityRu,
  gravityShort,
  sentFull,
  signalOf,
} from '@/domain/reference';
import { f1, pad, reportNo } from '@/domain/format';
import { riskZone } from '@/domain/scoring';
import type { NumericKey } from '@/domain/types';
import { useStore } from '@/state/store';
import { useFormModel } from '@/state/useForm';
import { useResult, type ResultModel } from '@/state/useResult';
import { Bar, Card, CardHead, Cells, Dot, VerdictBlock } from '@/components/ui';

export function AnalysisResult() {
  const result = useResult();
  const { state } = useStore();
  return (
    <div className="stack" style={{ opacity: state.running ? 0.4 : 1 }}>
      {result ? <ResultBody r={result} /> : <NoResult />}
    </div>
  );
}

/** §9.6 — no active analysis. */
function NoResult() {
  const { state } = useStore();
  const model = useFormModel();
  const { form, cur } = state;

  const valueOf = (k: (typeof FIELD_ORDER)[number]): string => {
    if (model.status[k] === 'bad') return 'out of range';
    if (model.status[k] !== 'ok') return 'not filled in';
    if (k === 'sector') return `${SEC[cur!].code} · ${SEC[cur!].name}`;
    if (k === 'material') return MAT[form.material!].label;
    if (k === 'gravity') return gravityRu(form.gravity!);
    return form[k as NumericKey] + UNITS[k as NumericKey];
  };

  return (
    <Card>
      <CardHead title="No Result Yet" />
      <div className="card__body">
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          An assessment is only produced once a sector is selected and all seven parameters are
          filled in. Missing values are never substituted or guessed.
        </p>
        <div className="rows">
          {FIELD_ORDER.map((k) => (
            <div
              key={k}
              className="field__head"
              style={{
                padding: '6px 10px',
                borderRadius: 8,
                background: model.status[k] === 'ok' ? 'var(--color-accent-100)' : 'transparent',
              }}
            >
              <Dot
                color={
                  model.status[k] === 'ok'
                    ? 'var(--color-accent-700)'
                    : 'var(--color-neutral-400)'
                }
              />
              <span style={{ fontSize: 13 }}>{FIELD_NAMES[k]}</span>
              <span className="field__status mono muted">{valueOf(k)}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

/** §9.7 — an active analysis exists. */
function ResultBody({ r }: { r: ResultModel }) {
  const { state, dispatch } = useStore();
  const { entry, scores } = r;
  const sec = SEC[entry.sector];
  const p = entry.p;
  const palette = state.tweaks.palette;

  const paramLine =
    `${MAT[p.material].label} ${f1(p.thickness)} mm · O₂ ${f1(p.o2)} % · ` +
    `${f1(p.flow)} cm/s · ${p.temp} °C · ${p.time} s · ${gravityRu(p.gravity)}`;

  return (
    <>
      {/* 1. Header */}
      <Card>
        <CardHead
          title="Analysis Result"
          kicker={`#${pad(entry.id)} · ${entry.ts} · ${sec.code} · ${sec.name}`}
        />
        <div className="card__body">
          {r.stale ? (
            <div className="notice notice--stale">
              Parameters have changed — this result reflects a previous run
            </div>
          ) : null}
          <span className="mono muted" style={{ fontSize: 12.5 }}>
            {paramLine}
          </span>
          <span className="muted" style={{ fontSize: 12 }}>
            Assessment per the Section 9 rules. Not a fire-development forecast.
          </span>
        </div>
      </Card>

      {/* 2. Sector AI-module assessment */}
      <Card>
        <CardHead
          title="Sector AI-Module Assessment"
          kicker="state model · v0.1"
          right={<span className="card__kicker">updated {entry.ts}</span>}
        />
        <div className="card__body">
          <div className="two-col">
            <div>
              <VerdictBlock
                label={VERDICT_RU[r.verdict]}
                subtitle={VERDICT_SUBTITLE[r.verdict]}
                fill={r.verdictSignal.fill}
                ink={r.verdictSignal.ink}
              />
              <p style={{ margin: 0, fontSize: 13.5 }}>{r.summary}</p>
              <div style={{ fontWeight: 500, fontSize: 13 }}>
                Assessment confidence <span className="mono">{entry.conf} %</span>
              </div>
              <Bar percent={entry.conf} color={r.verdictSignal.fill} />
              <span className="muted" style={{ fontSize: 12 }}>
                {r.confNote}
              </span>
            </div>
            <div>
              <span className="field__label">Factored Into the Assessment</span>
              <div className="rows">
                {[
                  ['Material', MAT[p.material].label, scores.t.mat, 3],
                  ['Thickness', `${f1(p.thickness)} mm`, scores.t.th, 3],
                  ['Oxygen', `${f1(p.o2)} %`, scores.t.o2, 3],
                  ['Air Flow', `${f1(p.flow)} cm/s`, scores.t.flow, 3],
                  ['Temperature', `${p.temp} °C`, scores.t.temp, 3],
                  ['Burn Time', `${p.time} s`, scores.t.time, 3],
                  ['Gravity', gravityShort(p.gravity), scores.t.grav, 1],
                ].map(([name, val, v, max]) => (
                  <div
                    key={name as string}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) 60px',
                      gap: 10,
                      alignItems: 'center',
                      fontSize: 12.5,
                    }}
                  >
                    <span>{name as string}</span>
                    <span className="mono muted">{val as string}</span>
                    <Cells value={v as number} max={max as number} fixed />
                  </div>
                ))}
              </div>
              <span className="muted" style={{ fontSize: 12 }}>
                The state assessment is advisory. The crew decides on actions.
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* 3. Report row */}
      <Card>
        <div className="card__head" style={{ paddingBottom: 16 }}>
          <Dot color={entry.sent ? 'var(--color-accent-700)' : DOT.medium} large />
          <span style={{ fontSize: 13.5 }}>Report {reportNo(entry.id)} for Earth</span>
          <span className="muted" style={{ fontSize: 12.5 }}>
            {sentFull(entry.sent)}
          </span>
          <span className="card__spacer chip-row">
            <button
              type="button"
              className="btn"
              onClick={() => dispatch({ type: 'modal', modal: { id: entry.id, view: 'recs' } })}
            >
              Recommendations
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                dispatch({ type: 'repId', id: entry.id });
                dispatch({ type: 'tab', tab: 'reports' });
              }}
            >
              Open Report
            </button>
          </span>
        </div>
      </Card>

      {/* 4. Two scale cards */}
      <div className="two-col">
        <Card>
          <div className="card__body" style={{ paddingTop: 16 }}>
            <div className="scale-card">
              <div className="scale-card__head">
                <span className="field__label">Risk Level</span>
                <span className="mono muted" style={{ fontSize: 11 }}>
                  RiskScore
                </span>
              </div>
              <VerdictBlock
                label={RISK_LEVEL_RU[scores.level]}
                subtitle={`${scores.risk} / 16`}
                fill={r.signal.fill}
                ink={r.signal.ink}
              />
              {/* 14-cell scale for values 3…16 (§9.7). */}
              <div className="scale-cells">
                {Array.from({ length: 14 }, (_, i) => {
                  const n = i + 3;
                  const z = signalOf(riskZone(n), palette);
                  return (
                    <span key={n} style={{ background: n <= scores.risk ? z.fill : z.tint }} />
                  );
                })}
              </div>
              <div className="scale-legend">
                <span>3 · low</span>
                <span>4–6 · medium</span>
                <span>≥ 7 · high</span>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="card__body" style={{ paddingTop: 16 }}>
            <div className="scale-card">
              <div className="scale-card__head">
                <span className="field__label">Extinction Probability</span>
                <span className="mono muted" style={{ fontSize: 11 }}>
                  ExtinctionScore
                </span>
              </div>
              <VerdictBlock
                label={EXT_LEVEL_RU[scores.extLevel]}
                subtitle={`${scores.ext} / 8`}
                fill="var(--color-accent-500)"
                ink="var(--color-accent-900)"
              />
              {/* 9-cell scale for 0…8; E cells are filled. */}
              <div className="scale-cells">
                {Array.from({ length: 9 }, (_, i) => (
                  <span
                    key={i}
                    style={{
                      background:
                        i <= scores.ext - 1
                          ? 'var(--color-accent-500)'
                          : i < 2
                            ? 'var(--color-accent-100)'
                            : i < 4
                              ? 'var(--color-accent-200)'
                              : 'var(--color-accent-300)',
                    }}
                  />
                ))}
              </div>
              <div className="scale-legend">
                <span>0–1 · low</span>
                <span>2–3 · medium</span>
                <span>≥ 4 · high</span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* 5. 16.2 banner */}
      {r.combo ? (
        <div className="notice notice--combo">
          High risk combined with a high extinction probability: the flame is unstable, with
          possible extinguishment and reignition. The scores are calculated independently.
        </div>
      ) : null}

      {/* 6. Why This Level / Recommended Actions */}
      <div className="two-col">
        <Card>
          <CardHead title="Why This Level" />
          <div className="card__body">
            <p style={{ margin: 0, fontSize: 13 }}>{r.why}</p>
            <p style={{ margin: 0, fontSize: 13 }}>{r.whyExt}</p>
          </div>
        </Card>
        <Card>
          <CardHead
            title="Recommended Actions"
            right={<span className="notice notice--draft">draft · 16.9</span>}
          />
          <div className="card__body">
            {/* First 3 steps of the SINGLE generator — the same as in the window and the report (§15.3). */}
            <div className="steps">
              {r.recs.steps.slice(0, 3).map((s, i) => (
                <div className={`step${i === 0 ? ' step--first' : ''}`} key={s.n}>
                  <span
                    className="step__n"
                    style={{ color: i === 0 ? r.signal.ink : undefined }}
                  >
                    {s.n}
                  </span>
                  <div>
                    <div className="step__title">{s.title}</div>
                    <div className="step__detail">{s.detail}</div>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="btn"
              onClick={() => dispatch({ type: 'modal', modal: { id: entry.id, view: 'recs' } })}
            >
              Recommendations
            </button>
          </div>
        </Card>
      </div>

      {/* 7. Breakdown */}
      <div className="two-col">
        <Card>
          <CardHead
            title="What Made Up the Risk"
            right={<span className="mono">Σ R {scores.risk}</span>}
          />
          <div className="card__body">
            <div className="rows">
              {[
                ['Material', 'MaterialRisk', MAT[p.material].label, scores.t.mat, 3],
                ['Oxygen', 'OxygenRisk', `${f1(p.o2)} %`, scores.t.o2, 3],
                ['Air Flow', 'FlowRisk', `${f1(p.flow)} cm/s`, scores.t.flow, 3],
                ['Temperature', 'TemperatureRisk', `${p.temp} °C`, scores.t.temp, 3],
                ['Burn Time', 'TimeRisk', `${p.time} s`, scores.t.time, 3],
                ['Gravity', 'GravityRisk', gravityRu(p.gravity), scores.t.grav, 1],
              ].map(([name, code, input, v, max]) => (
                <ScoreRow
                  key={code as string}
                  name={name as string}
                  code={code as string}
                  input={input as string}
                  value={v as number}
                  max={max as number}
                />
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <CardHead
            title="What Made Up the Extinction Score"
            right={<span className="mono">Σ E {scores.ext}</span>}
          />
          <div className="card__body">
            <div className="rows">
              <ScoreRow
                name="O₂ Deficit"
                code="OxygenDeficit"
                input={`${f1(p.o2)} %`}
                value={scores.t.od}
                max={3}
              />
              <ScoreRow
                name="Weak Flow"
                code="LowFlowPenalty"
                input={`${f1(p.flow)} cm/s`}
                value={scores.t.lf}
                max={2}
              />
              <ScoreRow
                name="Thickness"
                code="ThicknessBonus"
                input={`${f1(p.thickness)} mm`}
                value={scores.t.th}
                max={3}
              />
            </div>
            <span className="muted" style={{ fontSize: 12 }}>
              Thickness affects only extinction, not risk — this contradicts the parameter
              description (16.3).
            </span>
          </div>
        </Card>
      </div>
    </>
  );
}

function ScoreRow({
  name,
  code,
  input,
  value,
  max,
}: {
  name: string;
  code: string;
  input: string;
  value: number;
  max: number;
}) {
  return (
    <div className="score-row">
      <span>
        {name}
        <br />
        <span className="score-row__code">{code}</span>
      </span>
      <span className="score-row__val">{input}</span>
      <Cells value={value} max={max} fixed />
      <span className="score-row__score">{value}</span>
    </div>
  );
}
