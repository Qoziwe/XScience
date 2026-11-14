/** Форма параметров на вкладке «Анализ». FUNCTIONAL_SPEC.md §9.1–9.5. */
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

/** Правая метка статуса поля (§9.2). */
function statusText(
  status: FieldStatus,
  contribution: string,
  showContrib: boolean,
): { text: string; cls: string } {
  if (status === 'ok')
    return { text: showContrib ? contribution : '', cls: 'field__status field__status--ok' };
  if (status === 'bad') return { text: 'вне диапазона', cls: 'field__status field__status--off' };
  return { text: 'не заполнено', cls: 'field__status field__status--off' };
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
  // Пока поле пустое, ползунок стоит на минимуме с прозрачностью 45 % (§9.2).
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
          aria-label={`${label}, значение`}
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
    ? 'Датчики активны — ручной ввод заблокирован. Включите переопределение, чтобы ввести данные вручную.'
    : running
      ? 'Параметры зафиксированы до конца расчёта.'
      : model.anyBad
        ? 'Есть значения вне допустимого диапазона. Расчёт недоступен.'
        : !model.complete
          ? `Не хватает: ${model.missing.join(', ')}. Без всех параметров оценка не выдаётся.`
          : result?.stale
            ? 'Форма изменена. Запустите анализ, чтобы обновить результат.'
            : 'Все параметры заданы.';

  const run = () => {
    if (!canRun || !cur) return;
    runAnalysis(cur, toParams(form));
  };

  return (
    <Card className="col--form" style={{ display: 'flex', flexDirection: 'column' }}>
      <header className="card__head">
        <h2 className="card__title">Параметры</h2>
        <span className="mono muted" style={{ fontSize: 12 }}>
          {model.filledCount} из 8
        </span>
        <span className="card__spacer">
          {sensors.enabled ? (
            <div className="seg" role="group" aria-label="Ручной ввод">
              <button
                type="button"
                className="seg__opt"
                aria-pressed={!sensors.manualOverride}
                onClick={() => setManualOverride(false)}
              >
                Авто
              </button>
              <button
                type="button"
                className="seg__opt"
                aria-pressed={sensors.manualOverride}
                onClick={() => setManualOverride(true)}
              >
                Ручной ввод
              </button>
            </div>
          ) : null}
          <button
            type="button"
            className="btn"
            disabled={running}
            onClick={() => dispatch({ type: 'resetForm' })}
          >
            Очистить
          </button>
        </span>
      </header>

      <fieldset className="form-fields" disabled={running || locked}>
        {/* 0. Сектор корабля */}
        <div className="card__section">
          <div className="field__head">
            <span className="field__label">Сектор корабля</span>
            <span
              className={`field__status field__status--${status.sector === 'ok' ? 'ok' : 'off'}`}
            >
              {status.sector === 'ok' ? SEC[cur as SectorId].code : 'не заполнено'}
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
              Выбрать на карте
            </button>
            <span className="field__note">
              Анализ идёт внутри одного сектора и входит в общую оценку корабля.
            </span>
          </div>
        </div>

        {/* 1. Материал */}
        <div className="card__section">
          <FieldHead
            label="Материал"
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
                <span className="opt__meta">риск {m.risk}</span>
              </button>
            ))}
          </div>
          {form.material === 'other' ? (
            <div className="login__field">
              <label className="login__label" htmlFor="matdesc">
                Описание материала
              </label>
              <textarea
                id="matdesc"
                className="textarea"
                value={form.desc}
                placeholder="Состав, плотность, наличие покрытия…"
                onChange={(e) => setP({ desc: e.target.value })}
              />
              {!form.desc.trim() ? (
                <span className="field__hint">
                  Опишите материал — без описания расчёт недоступен
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* 2. Толщина */}
        <NumericField
          fieldKey="thickness"
          label="Толщина"
          value={form.thickness}
          status={status.thickness}
          contribution={contrib.th}
          showContrib={showContrib}
          onChange={(v) => setP({ thickness: v })}
        />

        {/* 3. Кислород */}
        <NumericField
          fieldKey="o2"
          label="Кислород"
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
              title="Поставить 21 % — состав воздуха"
            >
              21 · воздух
            </button>
            <span className="o2-scale__max">35</span>
          </div>
          {model.warnings.lowO2 ? (
            <span className="field__warn">{WARNING_TEXTS.lowO2}</span>
          ) : null}
        </NumericField>

        {/* 4. Поток воздуха */}
        <div className="card__section">
          <FieldHead
            label="Поток воздуха"
            status={status.flow}
            contribution={contrib.flow}
            showContrib={showContrib}
          />
          <div className="seg" role="group" aria-label="Режим ввода потока">
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
                          // Переход Точный → Простой: значение сохраняется только
                          // если равно пресету, иначе поле очищается (§9.2).
                          flow: FLOW_PRESETS.some((f) => f.value === pn(form.flow))
                            ? form.flow
                            : '',
                        }
                      : { flowMode: mode },
                  )
                }
              >
                {mode === 'simple' ? 'Простой' : 'Точный'}
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
                aria-label="Поток воздуха"
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
                aria-label="Поток воздуха, значение"
                onChange={(e) => setP({ flow: e.target.value })}
              />
              <span className="unit">см/с</span>
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

        {/* 5. Гравитация */}
        <div className="card__section">
          <FieldHead
            label="Гравитация"
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
          <span className="field__note">Только категория. Уровень g не оценивается.</span>
        </div>

        {/* 6. Температура */}
        <NumericField
          fieldKey="temp"
          label="Температура в зоне горения"
          value={form.temp}
          status={status.temp}
          contribution={contrib.temp}
          showContrib={showContrib}
          onChange={(v) => setP({ temp: v })}
        />

        {/* 7. Время горения */}
        <NumericField
          fieldKey="time"
          label="Время горения"
          value={form.time}
          status={status.time}
          contribution={contrib.time}
          showContrib={showContrib}
          onChange={(v) => setP({ time: v })}
        />
      </fieldset>

      {/* §9.4 — кнопка «Анализ» */}
      <div className="run-box">
        <button type="button" className="btn btn--primary btn--run" disabled={!canRun} onClick={run}>
          {running ? 'Расчёт…' : 'Анализ'}
          {running ? null : <span className="kbd">Ctrl ↵</span>}
        </button>
        <span className="run-hint">{hint}</span>
      </div>
    </Card>
  );
}

/** Подписи вклада поля (§9.2). */
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
