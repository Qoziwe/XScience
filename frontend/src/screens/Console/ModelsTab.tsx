/** Вкладка «Модели». FUNCTIONAL_SPEC.md §17. */
import { useRef } from 'react';
import { ALERT_INK, ALERT_TINT } from '@/domain/reference';
import { pn } from '@/domain/format';
import { DATASET, DATASET_RISK_CLASSES } from '@/domain/dataset';
import { useStore } from '@/state/store';
import { Card, CardHead } from '@/components/ui';

/** §17.1 — проверки готовности данных. [БЭКЕНД] GET /api/models/ml/readiness. */
const CHECKS = [
  {
    name: 'Строк в наборе',
    value: `${DATASET.length} / 50`,
    note: 'минимум для обучения по разделу 13 не достигнут',
    failed: true,
  },
  {
    name: 'Классов risk_level',
    value: `${DATASET_RISK_CLASSES} / 3`,
    note: 'все строки — high, классификатор обучить нельзя (16.4)',
    failed: true,
  },
  {
    name: 'Корректный data_source',
    value: `0 / ${DATASET.length}`,
    note: 'значение simulated_rule_based отсутствует в схеме 12.1',
    failed: true,
  },
  {
    name: 'Строк с gravity = earth',
    value: `0 / ${DATASET.length}`,
    note: 'признак не варьируется, вклад оценить невозможно',
    failed: false,
  },
];

const NOT_IMPLEMENTED = [
  'перенос массы',
  'перенос компонентов',
  'уравнение энергии',
  'реакция',
  'излучение q_rad',
  'момент затухания',
];

export function ModelsTab() {
  return (
    <main className="main">
      <div className="col col--half">
        <MlStage />
      </div>
      <div className="col col--half">
        <D2Stage />
        <PhotoStage />
      </div>
    </main>
  );
}

function MlStage() {
  return (
    <Card>
      <CardHead title="Stage 2 — ML-модель риска и затухания" kicker="не обучена" />
      <div className="card__body">
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Прогноз не выдаётся и не подменяется расчётом по правилам: пока модель не обучена,
          уровни считает только модуль расчёта раздела 14.
        </p>
        {CHECKS.map((c) => (
          <div
            key={c.name}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 10,
              padding: '8px 10px',
              borderRadius: 8,
              background: c.failed ? ALERT_TINT : 'transparent',
              fontSize: 12.5,
            }}
          >
            <span style={{ fontWeight: 500 }}>{c.name}</span>
            <span className="mono" style={{ color: c.failed ? ALERT_INK : undefined }}>
              {c.value}
            </span>
            <span className="card__spacer muted" style={{ textAlign: 'right' }}>
              {c.note}
            </span>
          </div>
        ))}
        {/* Кнопка всегда заблокирована (§17.1). */}
        <button type="button" className="btn btn--primary" disabled>
          Обучить модель
        </button>
        <span className="muted" style={{ fontSize: 12 }}>
          Обучение недоступно: набор данных не проходит три проверки из четырёх.
        </span>
        <div className="two-col">
          {['Прогноз уровня риска', 'Прогноз вероятности затухания'].map((n) => (
            <div key={n}>
              <span className="field__label">{n}</span>
              <span className="mono" style={{ fontSize: 22 }}>
                —
              </span>
              <span className="muted" style={{ fontSize: 12 }}>
                выдаётся только обученной моделью
              </span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

/** §17.2 — закон d²(t) = d₀² − K·t. */
function D2Stage() {
  const { state, dispatch } = useStore();
  const d0 = pn(state.d0);
  const k = pn(state.k);
  const okD0 = state.d0 !== '' && !Number.isNaN(d0) && d0 >= 0.1 && d0 <= 5;
  const okK = state.k !== '' && !Number.isNaN(k) && k >= 0.01 && k <= 5;
  const ready = okD0 && okK;

  const tBurn = ready ? (d0 * d0) / k : null;
  const sq = d0 * d0;
  const xEnd = 624;

  // Пунктир d(t) = √(d₀² − K·t), нормированный на d₀ (41 точка).
  const dPath = ready
    ? Array.from({ length: 41 }, (_, i) => {
        const t = (tBurn as number) * (i / 40);
        const d = Math.sqrt(Math.max(0, sq - k * t));
        const x = 52 + ((xEnd - 52) * i) / 40;
        const y = 192 - (d / d0) * 172;
        return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
      }).join('')
    : '';

  return (
    <Card>
      <CardHead title="Stage 3 — закон d²" kicker="сокращённая форма" />
      <div className="card__body">
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Реализован только закон d²(t) = d₀² − K·t. Полная модель в прототип не входит, источник
          константы K не задан.
        </p>

        <div className="two-col">
          <div>
            <span className="field__label">Начальный диаметр d₀</span>
            <div className="field__row">
              <input
                type="number"
                className="num"
                min={0.1}
                max={5}
                step={0.05}
                value={state.d0}
                placeholder="—"
                aria-label="Начальный диаметр d0, мм"
                onChange={(e) => dispatch({ type: 'd2', patch: { d0: e.target.value } })}
              />
              <span className="unit">мм</span>
            </div>
          </div>
          <div>
            <span className="field__label">Константа горения K</span>
            <div className="field__row">
              <input
                type="number"
                className="num"
                min={0.01}
                max={5}
                step={0.01}
                value={state.k}
                placeholder="—"
                aria-label="Константа горения K, мм²/с"
                onChange={(e) => dispatch({ type: 'd2', patch: { k: e.target.value } })}
              />
              <span className="unit">мм²/с</span>
            </div>
            <span className="muted" style={{ fontSize: 12 }}>
              значение задаёт оператор, по умолчанию не подставляется
            </span>
          </div>
        </div>

        <div className="field__head">
          <span className="field__label">Полное выгорание</span>
          <span className="field__status mono" style={{ color: ready ? undefined : 'var(--color-neutral-700)' }}>
            {ready ? `${(tBurn as number).toFixed(1)} с` : '—'}
          </span>
        </div>

        {ready ? (
          <div className="chart">
            <svg viewBox="0 0 660 220" role="img" aria-label="График d²(t)">
              <line className="chart__axis" x1={52} y1={192} x2={xEnd} y2={192} />
              <line className="chart__axis" x1={52} y1={20} x2={52} y2={192} />
              <line
                className="chart__line"
                x1={52}
                y1={20}
                x2={xEnd}
                y2={192}
                stroke="var(--color-accent-700)"
                strokeWidth={2}
              />
              <path className="chart__dash" d={dPath} />
              <text className="chart__label" x={8} y={24}>
                {sq.toFixed(2)}
              </text>
              <text className="chart__label" x={xEnd - 30} y={208}>
                {(tBurn as number).toFixed(1)} с
              </text>
            </svg>
          </div>
        ) : (
          <span className="muted" style={{ fontSize: 12.5 }}>
            Задайте d₀ и K — график строится только по введённым значениям.
          </span>
        )}

        <div>
          <span className="field__label">Не реализовано в прототипе</span>
          <div className="chip-row">
            {NOT_IMPLEMENTED.map((n) => (
              <span key={n} className="chip" style={{ cursor: 'default' }}>
                {n}
              </span>
            ))}
          </div>
        </div>
        <span className="muted" style={{ fontSize: 12 }}>
          Значения не сохраняются и с анализом не связаны.
        </span>
      </div>
    </Card>
  );
}

/** §17.3 — фото пламени. [ПРОТОТИП] снимок живёт только в памяти страницы. */
const ANNOTATIONS: [keyof import('@/state/store').Annotation, string, string[]][] = [
  ['size', 'Размер', ['малое', 'среднее', 'большое']],
  ['bright', 'Яркость', ['тусклое', 'умеренное', 'яркое']],
  ['shape', 'Форма', ['вытянутое', 'округлое']],
];

function PhotoStage() {
  const { state, dispatch } = useStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const photo = state.photo;

  const onPick = (file: File | undefined) => {
    if (!file) return;
    if (photo) URL.revokeObjectURL(photo.url);
    dispatch({
      type: 'photo',
      photo: {
        url: URL.createObjectURL(file),
        name: file.name,
        size: `${(file.size / 1024).toFixed(0)} КБ`,
      },
    });
  };

  return (
    <Card>
      <CardHead title="Фото пламени" kicker="распознавание не подключено" />
      <div className="card__body">
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Снимок прикладывается как материал наблюдения, признаки заполняет оператор.
          Автоматического распознавания нет.
        </p>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => onPick(e.target.files?.[0])}
        />

        {photo ? (
          <div className="photo-preview">
            <img src={photo.url} alt="Загруженный снимок пламени" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
              <span style={{ fontSize: 13, wordBreak: 'break-all' }}>{photo.name}</span>
              <span className="mono muted" style={{ fontSize: 12 }}>
                {photo.size}
              </span>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  URL.revokeObjectURL(photo.url);
                  dispatch({ type: 'photo', photo: null });
                }}
              >
                Убрать
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="photo-drop" onClick={() => inputRef.current?.click()}>
            <span style={{ fontWeight: 500 }}>Загрузить фото пламени</span>
            <span className="muted" style={{ fontSize: 12 }}>
              JPEG или PNG, один снимок
            </span>
          </button>
        )}

        {ANNOTATIONS.map(([key, name, opts]) => (
          <div key={key}>
            <span className="field__label">{name}</span>
            <div className="chip-row">
              {opts.map((label) => (
                <button
                  key={label}
                  type="button"
                  className="chip"
                  disabled={!photo}
                  aria-pressed={state.annotation[key] === label}
                  onClick={() => dispatch({ type: 'annotation', key, value: label })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ))}

        <span className="muted" style={{ fontSize: 12 }}>
          {photo
            ? 'Наблюдения оператора. В расчёт риска и затухания не входят.'
            : 'Заполняется после загрузки снимка.'}
        </span>
      </div>
    </Card>
  );
}
