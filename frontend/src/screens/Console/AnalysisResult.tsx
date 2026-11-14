/** Результат на вкладке «Анализ». FUNCTIONAL_SPEC.md §9.6, §9.7. */
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

/** §9.6 — нет активного анализа. */
function NoResult() {
  const { state } = useStore();
  const model = useFormModel();
  const { form, cur } = state;

  const valueOf = (k: (typeof FIELD_ORDER)[number]): string => {
    if (model.status[k] === 'bad') return 'вне диапазона';
    if (model.status[k] !== 'ok') return 'не заполнено';
    if (k === 'sector') return `${SEC[cur!].code} · ${SEC[cur!].name}`;
    if (k === 'material') return MAT[form.material!].label;
    if (k === 'gravity') return gravityRu(form.gravity!);
    return form[k as NumericKey] + UNITS[k as NumericKey];
  };

  return (
    <Card>
      <CardHead title="Результата пока нет" />
      <div className="card__body">
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Оценка выдаётся только при выбранном секторе и заполненных всех семи параметрах.
          Недостающие значения не подставляются и не угадываются.
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

/** §9.7 — есть активный анализ. */
function ResultBody({ r }: { r: ResultModel }) {
  const { state, dispatch } = useStore();
  const { entry, scores } = r;
  const sec = SEC[entry.sector];
  const p = entry.p;
  const palette = state.tweaks.palette;

  const paramLine =
    `${MAT[p.material].label} ${f1(p.thickness)} мм · O₂ ${f1(p.o2)} % · ` +
    `${f1(p.flow)} см/с · ${p.temp} °C · ${p.time} с · ${gravityRu(p.gravity)}`;

  return (
    <>
      {/* 1. Заголовок */}
      <Card>
        <CardHead
          title="Результат анализа"
          kicker={`#${pad(entry.id)} · ${entry.ts} · ${sec.code} · ${sec.name}`}
        />
        <div className="card__body">
          {r.stale ? (
            <div className="notice notice--stale">
              Параметры изменены — результат относится к прошлому запуску
            </div>
          ) : null}
          <span className="mono muted" style={{ fontSize: 12.5 }}>
            {paramLine}
          </span>
          <span className="muted" style={{ fontSize: 12 }}>
            Оценка по правилам раздела 9. Не прогноз развития пожара.
          </span>
        </div>
      </Card>

      {/* 2. Оценка ИИ-модуля по сектору */}
      <Card>
        <CardHead
          title="Оценка ИИ-модуля по сектору"
          kicker="модель состояния · v0.1"
          right={<span className="card__kicker">обновлено {entry.ts}</span>}
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
                Уверенность оценки <span className="mono">{entry.conf} %</span>
              </div>
              <Bar percent={entry.conf} color={r.verdictSignal.fill} />
              <span className="muted" style={{ fontSize: 12 }}>
                {r.confNote}
              </span>
            </div>
            <div>
              <span className="field__label">Что учтено в оценке</span>
              <div className="rows">
                {[
                  ['Материал', MAT[p.material].label, scores.t.mat, 3],
                  ['Толщина', `${f1(p.thickness)} мм`, scores.t.th, 3],
                  ['Кислород', `${f1(p.o2)} %`, scores.t.o2, 3],
                  ['Поток воздуха', `${f1(p.flow)} см/с`, scores.t.flow, 3],
                  ['Температура', `${p.temp} °C`, scores.t.temp, 3],
                  ['Время горения', `${p.time} с`, scores.t.time, 3],
                  ['Гравитация', gravityShort(p.gravity), scores.t.grav, 1],
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
                Оценка состояния — рекомендательная. Решение о действиях принимает экипаж.
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* 3. Строка отчёта */}
      <Card>
        <div className="card__head" style={{ paddingBottom: 16 }}>
          <Dot color={entry.sent ? 'var(--color-accent-700)' : DOT.medium} large />
          <span style={{ fontSize: 13.5 }}>Отчёт {reportNo(entry.id)} для Земли</span>
          <span className="muted" style={{ fontSize: 12.5 }}>
            {sentFull(entry.sent)}
          </span>
          <span className="card__spacer chip-row">
            <button
              type="button"
              className="btn"
              onClick={() => dispatch({ type: 'modal', modal: { id: entry.id, view: 'recs' } })}
            >
              Рекомендации
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                dispatch({ type: 'repId', id: entry.id });
                dispatch({ type: 'tab', tab: 'reports' });
              }}
            >
              Открыть отчёт
            </button>
          </span>
        </div>
      </Card>

      {/* 4. Две карточки шкал */}
      <div className="two-col">
        <Card>
          <div className="card__body" style={{ paddingTop: 16 }}>
            <div className="scale-card">
              <div className="scale-card__head">
                <span className="field__label">Уровень риска</span>
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
              {/* Шкала 14 ячеек для значений 3…16 (§9.7). */}
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
                <span>3 · низкий</span>
                <span>4–6 · средний</span>
                <span>≥ 7 · высокий</span>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="card__body" style={{ paddingTop: 16 }}>
            <div className="scale-card">
              <div className="scale-card__head">
                <span className="field__label">Вероятность затухания</span>
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
              {/* Шкала 9 ячеек для 0…8; закрашено E ячеек. */}
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
                <span>0–1 · низкая</span>
                <span>2–3 · средняя</span>
                <span>≥ 4 · высокая</span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* 5. Плашка 16.2 */}
      {r.combo ? (
        <div className="notice notice--combo">
          Высокий риск при высокой вероятности затухания: пламя нестабильно, возможны срыв и
          повторное воспламенение. Оценки рассчитываются независимо.
        </div>
      ) : null}

      {/* 6. Почему такой уровень / Рекомендуемые действия */}
      <div className="two-col">
        <Card>
          <CardHead title="Почему такой уровень" />
          <div className="card__body">
            <p style={{ margin: 0, fontSize: 13 }}>{r.why}</p>
            <p style={{ margin: 0, fontSize: 13 }}>{r.whyExt}</p>
          </div>
        </Card>
        <Card>
          <CardHead
            title="Рекомендуемые действия"
            right={<span className="notice notice--draft">черновик · 16.9</span>}
          />
          <div className="card__body">
            {/* Первые 3 шага ЕДИНОГО генератора — те же, что в окне и отчёте (§15.3). */}
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
              Рекомендации
            </button>
          </div>
        </Card>
      </div>

      {/* 7. Разложение */}
      <div className="two-col">
        <Card>
          <CardHead
            title="Из чего сложился риск"
            right={<span className="mono">Σ R {scores.risk}</span>}
          />
          <div className="card__body">
            <div className="rows">
              {[
                ['Материал', 'MaterialRisk', MAT[p.material].label, scores.t.mat, 3],
                ['Кислород', 'OxygenRisk', `${f1(p.o2)} %`, scores.t.o2, 3],
                ['Поток воздуха', 'FlowRisk', `${f1(p.flow)} см/с`, scores.t.flow, 3],
                ['Температура', 'TemperatureRisk', `${p.temp} °C`, scores.t.temp, 3],
                ['Время горения', 'TimeRisk', `${p.time} с`, scores.t.time, 3],
                ['Гравитация', 'GravityRisk', gravityRu(p.gravity), scores.t.grav, 1],
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
            title="Из чего сложилось затухание"
            right={<span className="mono">Σ E {scores.ext}</span>}
          />
          <div className="card__body">
            <div className="rows">
              <ScoreRow
                name="Дефицит O₂"
                code="OxygenDeficit"
                input={`${f1(p.o2)} %`}
                value={scores.t.od}
                max={3}
              />
              <ScoreRow
                name="Слабый поток"
                code="LowFlowPenalty"
                input={`${f1(p.flow)} см/с`}
                value={scores.t.lf}
                max={2}
              />
              <ScoreRow
                name="Толщина"
                code="ThicknessBonus"
                input={`${f1(p.thickness)} мм`}
                value={scores.t.th}
                max={3}
              />
            </div>
            <span className="muted" style={{ fontSize: 12 }}>
              Толщина влияет только на затухание, не на риск — это противоречит описанию параметра
              (16.3).
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
