/** "Models" tab. FUNCTIONAL_SPEC.md §17. */
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

/** §17.1 — checks against the local dataset: what the prototype shows without a server. */
const LOCAL_CHECKS: Readiness['checks'] = [
  {
    key: 'rows',
    label: 'Rows in dataset',
    value: DATASET.length,
    target: 50,
    passed: false,
    required: true,
    note: 'the Section 13 training minimum has not been reached',
  },
  {
    key: 'risk_classes',
    label: 'risk_level classes',
    value: DATASET_RISK_CLASSES,
    target: 3,
    passed: false,
    required: true,
    note: 'all rows are high, the classifier cannot be trained (16.4)',
  },
  {
    key: 'data_source',
    label: 'Valid data_source',
    value: 0,
    target: DATASET.length,
    passed: false,
    required: true,
    note: 'the value simulated_rule_based is absent from schema 12.1',
  },
  {
    key: 'earth_rows',
    label: 'Rows with gravity = earth',
    value: 0,
    target: DATASET.length,
    passed: false,
    required: false,
    note: 'the feature does not vary, its contribution cannot be assessed',
  },
];

const NOT_IMPLEMENTED = [
  'mass transfer',
  'species transfer',
  'energy equation',
  'reaction',
  'q_rad radiation',
  'extinction moment',
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

/** §17.1 — Stage 2. Checks, training, and prediction are performed by the server. */
function MlStage() {
  const { state } = useStore();
  const { form, cur } = state;

  // A prediction is only requested once the analysis form is fully filled in (§9.3).
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
    ? 'not trained'
    : m.loading
      ? 'loading…'
      : model?.trained
        ? `trained · ${model.version}`
        : 'not trained';

  return (
    <Card>
      <CardHead title="Stage 2 — Risk and Extinction ML Model" kicker={kicker} />
      <div className="card__body">
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          No prediction is issued and it never substitutes for the rule-based calculation: the
          verdict is always computed by the Section 14 calculation module.
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
            Training set: {training.rows} rows
            {training.excludedRows > 0 &&
              ` (${training.excludedRows} excluded — data_source outside schema §19.1)`}
            , risk_level classes {training.riskClasses.length}.
          </span>
        )}

        <button
          type="button"
          className="btn btn--primary"
          disabled={!m.available || !canTrain || m.training}
          onClick={() => void m.train()}
        >
          {m.training ? 'Training…' : model?.trained ? 'Retrain' : 'Train Model'}
        </button>

        <span className="muted" style={{ fontSize: 12 }}>
          {!m.available
            ? `Training unavailable: the dataset fails ${failedRequired} of four checks.`
            : canTrain
              ? 'Training available: required checks pass on rows with a valid data_source.'
              : `Training unavailable: ${training?.reasons.join('; ') || 'checks not passed'}.`}
        </span>

        {m.error && (
          <span style={{ fontSize: 12, color: ALERT_INK }}>Server: {m.error}</span>
        )}

        {model?.trained && model.metrics && (
          <div className="two-col">
            {Object.entries(model.metrics.targets).map(([target, acc]) => (
              <div key={target}>
                <span className="field__label">
                  {target === 'risk_level' ? 'Accuracy: risk' : 'Accuracy: extinction'}
                </span>
                <span className="mono" style={{ fontSize: 18 }}>
                  {(acc.testAccuracy * 100).toFixed(0)} %
                </span>
                <span className="muted" style={{ fontSize: 12 }}>
                  on the held-out set ({model.metrics?.testRows} rows)
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="two-col">
          <PredictionField
            name="Risk Level Prediction"
            level={m.prediction?.predictions.risk_level}
            words={RISK_LEVEL_RU}
            palette={state.tweaks.palette}
            hint={predictionHint(m.available, !!model?.trained, !!params, m.predictError)}
          />
          <PredictionField
            name="Extinction Probability Prediction"
            level={m.prediction?.predictions.extinction_probability}
            words={EXT_LEVEL_RU}
            palette={state.tweaks.palette}
            hint={predictionHint(m.available, !!model?.trained, !!params, m.predictError)}
          />
        </div>

        {training?.labelsAreRuleDerived && (
          <span className="muted" style={{ fontSize: 12 }}>
            The dataset labels are computed by the Section 14 formulas: the model approximates the
            rules, not independent observations. Until the dataset has real measurements, the
            prediction adds nothing to the calculation (16.4, §19.3).
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
  if (!available) return 'only produced by a trained model';
  if (!trained) return 'only produced by a trained model';
  if (!hasParams) return 'fill in the entire analysis form';
  if (error) return error;
  return 'prediction based on the current form values';
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
            {(Math.max(...Object.values(level.probabilities)) * 100).toFixed(0)} % model
            confidence
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

/** §17.2 — the d²(t) = d₀² − K·t law. */
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

  // The curve is computed locally — it's instantaneous and matches the server formula.
  // The server (§18.6) is polled with a delay and serves as a cross-check: a
  // discrepancy would mean the implementations have diverged.
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

  // Dashed curve d(t) = √(d₀² − K·t), normalized to d₀ (41 points).
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
      <CardHead title="Stage 3 — the d² Law" kicker="reduced form" />
      <div className="card__body">
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Only the law d²(t) = d₀² − K·t is implemented. The full model is not part of the
          prototype, and the source of the constant K is unspecified.
        </p>

        <div className="two-col">
          <div>
            <span className="field__label">Initial diameter d₀</span>
            <div className="field__row">
              <input
                type="number"
                className="num"
                min={0.1}
                max={5}
                step={0.05}
                value={state.d0}
                placeholder="—"
                aria-label="Initial diameter d0, mm"
                onChange={(e) => dispatch({ type: 'd2', patch: { d0: e.target.value } })}
              />
              <span className="unit">mm</span>
            </div>
          </div>
          <div>
            <span className="field__label">Burning constant K</span>
            <div className="field__row">
              <input
                type="number"
                className="num"
                min={0.01}
                max={5}
                step={0.01}
                value={state.k}
                placeholder="—"
                aria-label="Burning constant K, mm²/s"
                onChange={(e) => dispatch({ type: 'd2', patch: { k: e.target.value } })}
              />
              <span className="unit">mm²/s</span>
            </div>
            <span className="muted" style={{ fontSize: 12 }}>
              the value is set by the operator and is not defaulted
            </span>
          </div>
        </div>

        <div className="field__head">
          <span className="field__label">Complete Burnout</span>
          <span
            className="field__status mono"
            style={{ color: ready ? undefined : 'var(--color-neutral-700)' }}
          >
            {ready ? `${(tBurn as number).toFixed(1)} s` : '—'}
          </span>
        </div>

        {ready ? (
          <div className="chart">
            <svg viewBox="0 0 660 220" role="img" aria-label="d²(t) chart">
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
                {(tBurn as number).toFixed(1)} s
              </text>
            </svg>
          </div>
        ) : (
          <span className="muted" style={{ fontSize: 12.5 }}>
            Set d₀ and K — the chart is only drawn from entered values.
          </span>
        )}

        {ready && api.models && (
          <span
            className="muted"
            style={{ fontSize: 12, color: drift > 0.05 ? ALERT_INK : undefined }}
          >
            {serverErr
              ? `Server cross-check failed: ${serverErr}`
              : serverT == null
                ? 'Cross-checking with the server…'
                : drift > 0.05
                  ? `Discrepancy with the server: ${serverT.toFixed(1)} s vs. ${(tBurn as number).toFixed(1)} s`
                  : `Cross-checked with the server: ${serverT.toFixed(1)} s`}
          </span>
        )}

        <div>
          <span className="field__label">Not Implemented in the Prototype</span>
          <div className="chip-row">
            {NOT_IMPLEMENTED.map((n) => (
              <span key={n} className="chip" style={{ cursor: 'default' }}>
                {n}
              </span>
            ))}
          </div>
        </div>
        <span className="muted" style={{ fontSize: 12 }}>
          Values are not saved and are not linked to the analysis.
        </span>
      </div>
    </Card>
  );
}

/** §17.3 — flame photo: upload, operator annotation, model recognition. */
type AnnotationKey = keyof import('@/state/store').Annotation;
/** UI state key, label, §17.3 options, API key. */
const ANNOTATIONS: [AnnotationKey, string, string[], 'size' | 'brightness' | 'shape'][] = [
  ['size', 'Size', ['small', 'medium', 'large'], 'size'],
  ['bright', 'Brightness', ['dim', 'moderate', 'bright'], 'brightness'],
  ['shape', 'Shape', ['elongated', 'round'], 'shape'],
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
      // [PROTOTYPE] the photo lives only in the page's memory.
      dispatch({
        type: 'photo',
        photo: {
          url: URL.createObjectURL(file),
          name: file.name,
          size: `${(file.size / 1024).toFixed(0)} KB`,
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
          size: `${(uploaded.sizeBytes / 1024).toFixed(0)} KB`,
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

  /** The operator's annotation is kept both locally (for highlighting) and on the server. */
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
        title="Flame Photo"
        kicker={photos ? (rec ? `recognized · ${rec.model}` : 'recognition on demand') : 'recognition not connected'}
      />
      <div className="card__body">
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          {photos
            ? 'The photo is stored on the server as observational material. The operator fills in the features; the model may suggest its own — shown separately and not included in the calculation.'
            : 'The photo is attached as observational material, the operator fills in the features. There is no automatic recognition.'}
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
            <img src={photo.url} alt="Uploaded flame photo" />
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
                  {busy === 'recognize' ? 'Recognizing…' : 'Recognize'}
                </button>
              )}
              <button type="button" className="btn" disabled={!!busy} onClick={() => void remove()}>
                Remove
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
              {busy === 'upload' ? 'Uploading…' : 'Upload Flame Photo'}
            </span>
            <span className="muted" style={{ fontSize: 12 }}>
              JPEG or PNG, one photo
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
                  model: {rec[apiKey] ?? '—'}
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
            {rec.flameVisible ? rec.note : `Model: ${rec.note}`}
          </span>
        )}

        <span className="muted" style={{ fontSize: 12 }}>
          {photo
            ? "Operator's observations. Not included in the risk and extinction calculation."
            : 'Filled in after uploading a photo.'}
        </span>
      </div>
    </Card>
  );
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
