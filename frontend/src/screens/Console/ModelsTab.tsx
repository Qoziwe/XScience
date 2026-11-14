/** Вкладка «Модели». FUNCTIONAL_SPEC.md §17. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type Photo as ApiPhoto, type Readiness } from '@/api';
import {
  ALERT_INK,
  ALERT_TINT,
  EXT_LEVEL_RU,
  RISK_LEVEL_RU,
  signalOf,
} from '@/domain/reference';
import { pn } from '@/domain/format';
import { DATASET, DATASET_RISK_CLASSES } from '@/domain/dataset';
import { isComplete, statuses, toParams } from '@/domain/validation';
import { useStore } from '@/state/store';
import { useModels } from '@/state/useModels';
import { Card, CardHead, Dot } from '@/components/ui';

/** §17.1 — проверки по локальному набору: то, что показывает прототип без сервера. */
const LOCAL_CHECKS: Readiness['checks'] = [
  {
    key: 'rows',
    label: 'Строк в наборе',
    value: DATASET.length,
    target: 50,
    passed: false,
    required: true,
    note: 'минимум для обучения по разделу 13 не достигнут',
  },
  {
    key: 'risk_classes',
    label: 'Классов risk_level',
    value: DATASET_RISK_CLASSES,
    target: 3,
    passed: false,
    required: true,
    note: 'все строки — high, классификатор обучить нельзя (16.4)',
  },
  {
    key: 'data_source',
    label: 'Корректный data_source',
    value: 0,
    target: DATASET.length,
    passed: false,
    required: true,
    note: 'значение simulated_rule_based отсутствует в схеме 12.1',
  },
  {
    key: 'earth_rows',
    label: 'Строк с gravity = earth',
    value: 0,
    target: DATASET.length,
    passed: false,
    required: false,
    note: 'признак не варьируется, вклад оценить невозможно',
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

/** §17.1 — Stage 2. Проверки, обучение и прогноз выполняет сервер. */
function MlStage() {
  const { state } = useStore();
  const { form, cur } = state;

  // Прогноз запрашивается только по заполненной целиком форме анализа (§9.3).
  const params = useMemo(() => {
    const st = statuses(form, cur);
    return isComplete(st) ? toParams(form) : null;
  }, [form, cur]);

  const m = useModels(params);
  const checks = m.readiness?.checks ?? LOCAL_CHECKS;
  const training = m.readiness?.trainingSet;
  const model = m.readiness?.model;
  const failedRequired = checks.filter((c) => c.required && !c.passed).length;
  const canTrain = !!training?.canTrain;

  const kicker = !m.available
    ? 'не обучена'
    : m.loading
      ? 'загрузка…'
      : model?.trained
        ? `обучена · ${model.version}`
        : 'не обучена';

  return (
    <Card>
      <CardHead title="Stage 2 — ML-модель риска и затухания" kicker={kicker} />
      <div className="card__body">
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Прогноз не выдаётся и не подменяется расчётом по правилам: вердикт в любом случае
          считает модуль расчёта раздела 14.
        </p>

        {checks.map((c) => (
          <div
            key={c.key}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 10,
              padding: '8px 10px',
              borderRadius: 8,
              background: c.passed ? 'transparent' : ALERT_TINT,
              fontSize: 12.5,
            }}
          >
            <span style={{ fontWeight: 500 }}>{c.label}</span>
            <span className="mono" style={{ color: c.passed ? undefined : ALERT_INK }}>
              {c.value} / {c.target}
            </span>
            <span className="card__spacer muted" style={{ textAlign: 'right' }}>
              {c.note}
            </span>
          </div>
        ))}

        {training && (
          <span className="muted" style={{ fontSize: 12 }}>
            Обучающий набор: {training.rows} строк
            {training.excludedRows > 0 &&
              ` (исключено ${training.excludedRows} — data_source вне схемы §19.1)`}
            , классов risk_level {training.riskClasses.length}.
          </span>
        )}

        <button
          type="button"
          className="btn btn--primary"
          disabled={!m.available || !canTrain || m.training}
          onClick={() => void m.train()}
        >
          {m.training ? 'Обучение…' : model?.trained ? 'Обучить заново' : 'Обучить модель'}
        </button>

        <span className="muted" style={{ fontSize: 12 }}>
          {!m.available
            ? `Обучение недоступно: набор данных не проходит ${failedRequired} проверки из четырёх.`
            : canTrain
              ? 'Обучение доступно: обязательные проверки пройдены на строках с допустимым data_source.'
              : `Обучение недоступно: ${training?.reasons.join('; ') || 'проверки не пройдены'}.`}
        </span>

        {m.error && (
          <span style={{ fontSize: 12, color: ALERT_INK }}>Сервер: {m.error}</span>
        )}

        {model?.trained && model.metrics && (
          <div className="two-col">
            {Object.entries(model.metrics.targets).map(([target, acc]) => (
              <div key={target}>
                <span className="field__label">
                  {target === 'risk_level' ? 'Точность: риск' : 'Точность: затухание'}
                </span>
                <span className="mono" style={{ fontSize: 18 }}>
                  {(acc.testAccuracy * 100).toFixed(0)} %
                </span>
                <span className="muted" style={{ fontSize: 12 }}>
                  на отложенной выборке ({model.metrics?.testRows} строк)
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="two-col">
          <PredictionField
            name="Прогноз уровня риска"
            level={m.prediction?.predictions.risk_level}
            words={RISK_LEVEL_RU}
            palette={state.tweaks.palette}
            hint={predictionHint(m.available, !!model?.trained, !!params, m.predictError)}
          />
          <PredictionField
            name="Прогноз вероятности затухания"
            level={m.prediction?.predictions.extinction_probability}
            words={EXT_LEVEL_RU}
            palette={state.tweaks.palette}
            hint={predictionHint(m.available, !!model?.trained, !!params, m.predictError)}
          />
        </div>

        {training?.labelsAreRuleDerived && (
          <span className="muted" style={{ fontSize: 12 }}>
            Метки набора посчитаны формулами раздела 14: модель приближает правила, а не
            независимые наблюдения. Пока в наборе нет измерений, прогноз ничего не добавляет
            к расчёту (16.4, §19.3).
          </span>
        )}
        {m.trainNote && (
          <span className="muted" style={{ fontSize: 12 }}>
            {m.trainNote}
          </span>
        )}
      </div>
    </Card>
  );
}

function predictionHint(
  available: boolean,
  trained: boolean,
  hasParams: boolean,
  error: string,
): string {
  if (!available) return 'выдаётся только обученной моделью';
  if (!trained) return 'выдаётся только обученной моделью';
  if (!hasParams) return 'заполните форму анализа целиком';
  if (error) return error;
  return 'прогноз по текущим значениям формы';
}

function PredictionField({
  name,
  level,
  words,
  palette,
  hint,
}: {
  name: string;
  level?: { label: 'low' | 'medium' | 'high'; probabilities: Record<string, number> };
  words: Record<string, string>;
  palette: 'signal' | 'mono';
  hint: string;
}) {
  return (
    <div>
      <span className="field__label">{name}</span>
      {level ? (
        <>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 20 }}>
            <Dot color={signalOf(level.label, palette).fill} />
            {words[level.label]}
          </span>
          <span className="mono muted" style={{ fontSize: 12 }}>
            {(Math.max(...Object.values(level.probabilities)) * 100).toFixed(0)} % уверенности
            модели
          </span>
        </>
      ) : (
        <span className="mono" style={{ fontSize: 22 }}>
          —
        </span>
      )}
      <span className="muted" style={{ fontSize: 12 }}>
        {hint}
      </span>
    </div>
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

  // Кривая считается на месте — она мгновенная и совпадает с серверной формулой.
  // Сервер (§18.6) опрашивается с задержкой и служит сверкой: расхождение
  // означало бы, что реализации разошлись.
  const [serverT, setServerT] = useState<number | null>(null);
  const [serverErr, setServerErr] = useState('');
  useEffect(() => {
    const source = api.models;
    if (!source || !ready) {
      setServerT(null);
      setServerErr('');
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      source
        .d2(d0, k)
        .then((res) => alive && (setServerT(res.tBurnS), setServerErr('')))
        .catch((e) => alive && (setServerT(null), setServerErr(String(e.message ?? e))));
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [ready, d0, k]);

  const drift = serverT != null && tBurn != null ? Math.abs(serverT - tBurn) : 0;

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
          <span
            className="field__status mono"
            style={{ color: ready ? undefined : 'var(--color-neutral-700)' }}
          >
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

        {ready && api.models && (
          <span
            className="muted"
            style={{ fontSize: 12, color: drift > 0.05 ? ALERT_INK : undefined }}
          >
            {serverErr
              ? `Сверка с сервером не удалась: ${serverErr}`
              : serverT == null
                ? 'Сверка с сервером…'
                : drift > 0.05
                  ? `Расхождение с сервером: ${serverT.toFixed(1)} с против ${(tBurn as number).toFixed(1)} с`
                  : `Сверено с сервером: ${serverT.toFixed(1)} с`}
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

/** §17.3 — фото пламени: загрузка, разметка оператора, распознавание моделью. */
type AnnotationKey = keyof import('@/state/store').Annotation;
/** Ключ в состоянии интерфейса, подпись, варианты §17.3, ключ в API. */
const ANNOTATIONS: [AnnotationKey, string, string[], 'size' | 'brightness' | 'shape'][] = [
  ['size', 'Размер', ['малое', 'среднее', 'большое'], 'size'],
  ['bright', 'Яркость', ['тусклое', 'умеренное', 'яркое'], 'brightness'],
  ['shape', 'Форма', ['вытянутое', 'округлое'], 'shape'],
];

function PhotoStage() {
  const { state, dispatch } = useStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const photo = state.photo;
  const photos = api.photos;
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [server, setServer] = useState<ApiPhoto | null>(null);

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    setErr('');
    if (photo && !photo.id) URL.revokeObjectURL(photo.url);

    if (!photos) {
      // [ПРОТОТИП] снимок живёт только в памяти страницы.
      dispatch({
        type: 'photo',
        photo: {
          url: URL.createObjectURL(file),
          name: file.name,
          size: `${(file.size / 1024).toFixed(0)} КБ`,
        },
      });
      return;
    }

    setBusy('upload');
    try {
      const uploaded = await photos.upload(file, state.activeId);
      setServer(uploaded);
      dispatch({
        type: 'photo',
        photo: {
          id: uploaded.id,
          url: uploaded.fileUrl,
          name: uploaded.fileName,
          size: `${(uploaded.sizeBytes / 1024).toFixed(0)} КБ`,
        },
      });
    } catch (e) {
      setErr(messageOf(e));
    } finally {
      setBusy('');
    }
  };

  const remove = async () => {
    setErr('');
    if (photo?.id && photos) {
      setBusy('remove');
      try {
        await photos.remove(photo.id);
      } catch (e) {
        setErr(messageOf(e));
      } finally {
        setBusy('');
      }
    } else if (photo) {
      URL.revokeObjectURL(photo.url);
    }
    setServer(null);
    dispatch({ type: 'photo', photo: null });
  };

  const recognize = async () => {
    if (!photo?.id || !photos) return;
    setErr('');
    setBusy('recognize');
    try {
      setServer(await photos.recognize(photo.id));
    } catch (e) {
      setErr(messageOf(e));
    } finally {
      setBusy('');
    }
  };

  /** Разметку оператора храним и локально (для подсветки), и на сервере. */
  const setAnnotation = async (
    key: AnnotationKey,
    apiKey: 'size' | 'brightness' | 'shape',
    label: string,
  ) => {
    const next = state.annotation[key] === label ? '' : label;
    dispatch({ type: 'annotation', key, value: label });
    if (!photo?.id || !photos) return;
    try {
      setServer(await photos.annotate(photo.id, { [apiKey]: next }));
    } catch (e) {
      setErr(messageOf(e));
    }
  };

  const rec = server?.recognition ?? null;

  return (
    <Card>
      <CardHead
        title="Фото пламени"
        kicker={photos ? (rec ? `распознано · ${rec.model}` : 'распознавание по кнопке') : 'распознавание не подключено'}
      />
      <div className="card__body">
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          {photos
            ? 'Снимок хранится на сервере как материал наблюдения. Признаки заполняет оператор; модель может предложить свои — они показаны отдельно и в расчёт не входят.'
            : 'Снимок прикладывается как материал наблюдения, признаки заполняет оператор. Автоматического распознавания нет.'}
        </p>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png"
          className="sr-only"
          onChange={(e) => void onPick(e.target.files?.[0])}
        />

        {photo ? (
          <div className="photo-preview">
            <img src={photo.url} alt="Загруженный снимок пламени" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
              <span style={{ fontSize: 13, wordBreak: 'break-all' }}>{photo.name}</span>
              <span className="mono muted" style={{ fontSize: 12 }}>
                {photo.size}
              </span>
              {photos && photo.id && (
                <button
                  type="button"
                  className="btn"
                  disabled={!!busy}
                  onClick={() => void recognize()}
                >
                  {busy === 'recognize' ? 'Распознаю…' : 'Распознать'}
                </button>
              )}
              <button type="button" className="btn" disabled={!!busy} onClick={() => void remove()}>
                Убрать
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="photo-drop"
            disabled={busy === 'upload'}
            onClick={() => inputRef.current?.click()}
          >
            <span style={{ fontWeight: 500 }}>
              {busy === 'upload' ? 'Загрузка…' : 'Загрузить фото пламени'}
            </span>
            <span className="muted" style={{ fontSize: 12 }}>
              JPEG или PNG, один снимок
            </span>
          </button>
        )}

        {err && <span style={{ fontSize: 12, color: ALERT_INK }}>{err}</span>}

        {ANNOTATIONS.map(([key, name, opts, apiKey]) => (
          <div key={key}>
            <div className="field__head">
              <span className="field__label">{name}</span>
              {rec && (
                <span className="field__status muted" style={{ fontSize: 12 }}>
                  модель: {rec[apiKey] ?? '—'}
                </span>
              )}
            </div>
            <div className="chip-row">
              {opts.map((label) => (
                <button
                  key={label}
                  type="button"
                  className="chip"
                  disabled={!photo}
                  aria-pressed={state.annotation[key] === label}
                  onClick={() => void setAnnotation(key, apiKey, label)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ))}

        {rec && (
          <span className="muted" style={{ fontSize: 12 }}>
            {rec.flameVisible ? rec.note : `Модель: ${rec.note}`}
          </span>
        )}

        <span className="muted" style={{ fontSize: 12 }}>
          {photo
            ? 'Наблюдения оператора. В расчёт риска и затухания не входят.'
            : 'Заполняется после загрузки снимка.'}
        </span>
      </div>
    </Card>
  );
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
