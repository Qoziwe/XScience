/** Parameters form on the "Analysis" tab. FUNCTIONAL_SPEC.md §9.1–9.5. */
import {
  DOT,
  FLOW_PRESETS,
  GRAVITY_OPTIONS,
  MATERIALS,
  RANGES,
  RANGE_ERRORS,
  SECTORS,
  SEC,
  STEPS,
  UNITS,
} from '@/domain/reference';
import { pn } from '@/domain/format';
import { WARNING_TEXTS, toParams, type FormState } from '@/domain/validation';
import type { FieldStatus, NumericKey, SectorId } from '@/domain/types';
import { shipStatus } from '@/domain/ship';
import { useStore } from '@/state/store';
import { useFormModel, type LiveScores } from '@/state/useForm';
import { useResult } from '@/state/useResult';
import { Card, Dot } from '@/components/ui';

/** Right-hand field status label (§9.2). */
function statusText(
  status: FieldStatus,
  contribution: string,
  showContrib: boolean,
): { text: string; cls: string } {
  if (status === 'ok')
    return { text: showContrib ? contribution : '', cls: 'field__status field__status--ok' };
  if (status === 'bad') return { text: 'out of range', cls: 'field__status field__status--off' };
  return { text: 'not filled in', cls: 'field__status field__status--off' };
}

function FieldHead({
  label,
  status,
  contribution,
  showContrib,
}: {
  label: string;
  status: FieldStatus;
  contribution: string;
  showContrib: boolean;
}) {
  const s = statusText(status, contribution, showContrib);
  return (
    <div className="field__head">
      <span className="field__label">{label}</span>
      <span className={s.cls}>{s.text}</span>
    </div>
  );
}

function NumericField({
  fieldKey,
  label,
  value,
  status,
  contribution,
  showContrib,
  onChange,
  children,
}: {
  fieldKey: NumericKey;
  label: string;
  value: string;
  status: FieldStatus;
  contribution: string;
  showContrib: boolean;
  onChange: (v: string) => void;
  children?: React.ReactNode;
}) {
  const [min, max] = RANGES[fieldKey];
  const step = STEPS[fieldKey];
  const parsed = pn(value);
  // While the field is empty, the slider sits at the minimum with 45% opacity (§9.2).
  const sliderValue = Number.isNaN(parsed) ? min : parsed;

  return (
    <div className="card__section">
      <FieldHead
        label={label}
        status={status}
        contribution={contribution}
        showContrib={showContrib}
      />
      <div className="field__row">
        <input
          type="range"
          className={`slider${status === 'empty' ? ' slider--empty' : ''}`}
          min={min}
          max={max}
          step={step}
          value={sliderValue}
          aria-label={label}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          type="number"
          className={`num${status === 'bad' ? ' num--bad' : ''}`}
          min={min}
          max={max}
          step={step}
          value={value}
          placeholder="—"
          aria-label={`${label}, value`}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="unit">{UNITS[fieldKey].trim()}</span>
      </div>
      {children}
      {status === 'bad' ? <span className="field__hint">{RANGE_ERRORS[fieldKey]}</span> : null}
    </div>
  );
}

export function AnalysisForm() {
  const { state, dispatch, runAnalysis, setManualOverride } = useStore();
  const { form, cur, running, hist, tweaks, sensors } = state;
  const model = useFormModel();
  const result = useResult();
  const ship = shipStatus(hist);
  const showContrib = tweaks.showContrib;
  const { status, live } = model;
  const locked = sensors.enabled && !sensors.manualOverride;

  const setP = (patch: Partial<FormState>) => dispatch({ type: 'patchForm', patch });
  const contrib = contributions(live);

  const canRun = model.complete && !running && !locked;
  const hint = locked
    ? 'Sensors are active — manual input is locked. Enable override to enter data manually.'
    : running
      ? 'Parameters are locked until the calculation finishes.'
      : model.anyBad
        ? 'Some values are out of the allowed range. Calculation unavailable.'
        : !model.complete
          ? `Missing: ${model.missing.join(', ')}. The assessment requires all parameters.`
          : result?.stale
            ? 'The form has changed. Run the analysis to refresh the result.'
            : 'All parameters are set.';

  const run = () => {
    if (!canRun || !cur) return;
    runAnalysis(cur, toParams(form));
  };

  return (
    <Card className="col--form" style={{ display: 'flex', flexDirection: 'column' }}>
      <header className="card__head">
        <h2 className="card__title">Parameters</h2>
        <span className="mono muted" style={{ fontSize: 12 }}>
          {model.filledCount} of 8
        </span>
        <span className="card__spacer">
          {sensors.enabled ? (
            <div className="seg" role="group" aria-label="Manual input">
              <button
                type="button"
                className="seg__opt"
                aria-pressed={!sensors.manualOverride}
                onClick={() => setManualOverride(false)}
              >
                Auto
              </button>
              <button
                type="button"
                className="seg__opt"
                aria-pressed={sensors.manualOverride}
                onClick={() => setManualOverride(true)}
              >
                Manual Input
              </button>
            </div>
          ) : null}
          <button
            type="button"
            className="btn"
            disabled={running}
            onClick={() => dispatch({ type: 'resetForm' })}
          >
            Clear
          </button>
        </span>
      </header>

      <fieldset className="form-fields" disabled={running || locked}>
        {/* 0. Ship sector */}
        <div className="card__section">
          <div className="field__head">
            <span className="field__label">Ship Sector</span>
            <span
              className={`field__status field__status--${status.sector === 'ok' ? 'ok' : 'off'}`}
            >
              {status.sector === 'ok' ? SEC[cur as SectorId].code : 'not filled in'}
            </span>
          </div>
          <div className="grid2">
            {SECTORS.map((s) => (
              <button
                key={s.id}
                type="button"
                className="opt"
                aria-pressed={cur === s.id}
                onClick={() => dispatch({ type: 'pickSector', sector: s.id })}
              >
                <Dot color={DOT[ship.statusOf(s.id)]} />
                <span className="opt__col">
                  <span className="opt__meta">{s.code}</span>
                  <span className="opt__name">{s.name}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="field__head" style={{ flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              className="btn--link"
              onClick={() => dispatch({ type: 'tab', tab: 'map' })}
            >
              Choose on the map
            </button>
            <span className="field__note">
              The analysis runs within a single sector and feeds into the overall ship assessment.
            </span>
          </div>
        </div>

        {/* 1. Material */}
        <div className="card__section">
          <FieldHead
            label="Material"
            status={status.material}
            contribution={contrib.mat}
            showContrib={showContrib}
          />
          <div className="grid2">
            {MATERIALS.map((m) => (
              <button
                key={m.code}
                type="button"
                className="opt opt--stack"
                aria-pressed={form.material === m.code}
                onClick={() => setP({ material: m.code })}
              >
                <span>{m.label}</span>
                <span className="opt__meta">risk {m.risk}</span>
              </button>
            ))}
          </div>
          {form.material === 'other' ? (
            <div className="login__field">
              <label className="login__label" htmlFor="matdesc">
                Material Description
              </label>
              <textarea
                id="matdesc"
                className="textarea"
                value={form.desc}
                placeholder="Composition, density, coating…"
                onChange={(e) => setP({ desc: e.target.value })}
              />
              {!form.desc.trim() ? (
                <span className="field__hint">
                  Describe the material — the calculation is unavailable without a description
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* 2. Thickness */}
        <NumericField
          fieldKey="thickness"
          label="Thickness"
          value={form.thickness}
          status={status.thickness}
          contribution={contrib.th}
          showContrib={showContrib}
          onChange={(v) => setP({ thickness: v })}
        />

        {/* 3. Oxygen */}
        <NumericField
          fieldKey="o2"
          label="Oxygen"
          value={form.o2}
          status={status.o2}
          contribution={contrib.o2}
          showContrib={showContrib}
          onChange={(v) => setP({ o2: v })}
        >
          <div className="o2-scale">
            <span className="o2-scale__min">13</span>
            <button
              type="button"
              className="o2-scale__air"
              onClick={() => setP({ o2: '21' })}
              title="Set to 21% — air composition"
            >
              21 · air
            </button>
            <span className="o2-scale__max">35</span>
          </div>
          {model.warnings.lowO2 ? (
            <span className="field__warn">{WARNING_TEXTS.lowO2}</span>
          ) : null}
        </NumericField>

        {/* 4. Air flow */}
        <div className="card__section">
          <FieldHead
            label="Air Flow"
            status={status.flow}
            contribution={contrib.flow}
            showContrib={showContrib}
          />
          <div className="seg" role="group" aria-label="Flow input mode">
            {(['simple', 'precise'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className="seg__opt"
                aria-pressed={form.flowMode === mode}
                onClick={() =>
                  setP(
                    mode === 'simple'
                      ? {
                          flowMode: mode,
                          // Precise → Simple transition: the value is kept only if it
                          // matches a preset, otherwise the field is cleared (§9.2).
                          flow: FLOW_PRESETS.some((f) => f.value === pn(form.flow))
                            ? form.flow
                            : '',
                        }
                      : { flowMode: mode },
                  )
                }
              >
                {mode === 'simple' ? 'Simple' : 'Precise'}
              </button>
            ))}
          </div>

          {form.flowMode === 'precise' ? (
            <div className="field__row">
              <input
                type="range"
                className={`slider${status.flow === 'empty' ? ' slider--empty' : ''}`}
                min={RANGES.flow[0]}
                max={RANGES.flow[1]}
                step={STEPS.flow}
                value={Number.isNaN(pn(form.flow)) ? RANGES.flow[0] : pn(form.flow)}
                aria-label="Air Flow"
                onChange={(e) => setP({ flow: e.target.value })}
              />
              <input
                type="number"
                className={`num${status.flow === 'bad' ? ' num--bad' : ''}`}
                min={RANGES.flow[0]}
                max={RANGES.flow[1]}
                step={STEPS.flow}
                value={form.flow}
                placeholder="—"
                aria-label="Air Flow, value"
                onChange={(e) => setP({ flow: e.target.value })}
              />
              <span className="unit">cm/s</span>
            </div>
          ) : (
            <div className="grid4">
              {FLOW_PRESETS.map((f) => (
                <button
                  key={f.code}
                  type="button"
                  className="opt opt--stack"
                  aria-pressed={form.flow !== '' && pn(form.flow) === f.value}
                  onClick={() => setP({ flow: String(f.value) })}
                >
                  <span>{f.label}</span>
                  <span className="opt__meta">{f.value}</span>
                </button>
              ))}
            </div>
          )}
          {status.flow === 'bad' ? (
            <span className="field__hint">{RANGE_ERRORS.flow}</span>
          ) : null}
          {model.warnings.noFlow ? (
            <span className="field__warn">{WARNING_TEXTS.noFlow}</span>
          ) : null}
          {model.warnings.highFlow ? (
            <span className="field__warn">{WARNING_TEXTS.highFlow}</span>
          ) : null}
        </div>

        {/* 5. Gravity */}
        <div className="card__section">
          <FieldHead
            label="Gravity"
            status={status.gravity}
            contribution={contrib.grav}
            showContrib={showContrib}
          />
          <div className="grid2">
            {GRAVITY_OPTIONS.map((g) => (
              <button
                key={g.code}
                type="button"
                className="opt"
                aria-pressed={form.gravity === g.code}
                onClick={() => setP({ gravity: g.code })}
              >
                <span className="opt__name">{g.label}</span>
              </button>
            ))}
          </div>
          <span className="field__note">Category only. The g-level itself is not assessed.</span>
        </div>

        {/* 6. Temperature */}
        <NumericField
          fieldKey="temp"
          label="Temperature in the Combustion Zone"
          value={form.temp}
          status={status.temp}
          contribution={contrib.temp}
          showContrib={showContrib}
          onChange={(v) => setP({ temp: v })}
        />

        {/* 7. Burn time */}
        <NumericField
          fieldKey="time"
          label="Burn Time"
          value={form.time}
          status={status.time}
          contribution={contrib.time}
          showContrib={showContrib}
          onChange={(v) => setP({ time: v })}
        />
      </fieldset>

      {/* §9.4 — "Analyze" button */}
      <div className="run-box">
        <button type="button" className="btn btn--primary btn--run" disabled={!canRun} onClick={run}>
          {running ? 'Calculating…' : 'Analyze'}
          {running ? null : <span className="kbd">Ctrl ↵</span>}
        </button>
        <span className="run-hint">{hint}</span>
      </div>
    </Card>
  );
}

/** Field contribution labels (§9.2). */
function contributions(live: LiveScores) {
  return {
    mat: `R +${live.mat}`,
    th: `E +${live.th}`,
    o2: `R +${live.o2} · E +${live.od}`,
    flow: `R +${live.flow} · E +${live.lf}`,
    grav: `R +${live.grav}`,
    temp: `R +${live.temp}`,
    time: `R +${live.time}`,
  };
}
