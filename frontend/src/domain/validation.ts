/**
 * Валидация формы. FUNCTIONAL_SPEC.md §9.3.
 * Значения формы хранятся строками (пустая строка = не заполнено).
 * [БЭКЕНД] повторяет эти правила независимо от клиента и отвечает 422 (§18.9).
 */
import { FIELD_ORDER, RANGES } from './reference';
import { pn } from './format';
import type {
  AnalysisParams,
  FieldKey,
  FieldStatus,
  Gravity,
  MaterialType,
  NumericKey,
  SectorId,
} from './types';

export interface FormState {
  material: MaterialType | null;
  desc: string;
  thickness: string;
  o2: string;
  flow: string;
  /** Состояние интерфейса, в анализ не сохраняется (§3.3). */
  flowMode: 'simple' | 'precise';
  gravity: Gravity | null;
  temp: string;
  time: string;
}

/** §9.1 — пустое состояние формы. По умолчанию режим потока «Точный». */
export const EMPTY_FORM: FormState = {
  material: null,
  desc: '',
  thickness: '',
  o2: '',
  flow: '',
  flowMode: 'precise',
  gravity: null,
  temp: '',
  time: '',
};

export const NUMERIC_KEYS: NumericKey[] = ['thickness', 'o2', 'flow', 'temp', 'time'];

export type FieldStatuses = Record<FieldKey, FieldStatus>;

export function statuses(form: FormState, sector: SectorId | null): FieldStatuses {
  const out = {} as FieldStatuses;
  out.sector = sector ? 'ok' : 'empty';
  out.material = !form.material
    ? 'empty'
    : form.material === 'other' && !form.desc.trim()
      ? 'empty'
      : 'ok';
  out.gravity = form.gravity ? 'ok' : 'empty';
  for (const k of NUMERIC_KEYS) {
    const raw = form[k];
    const v = pn(raw);
    const [min, max] = RANGES[k];
    out[k] = raw === '' ? 'empty' : Number.isNaN(v) || v < min || v > max ? 'bad' : 'ok';
  }
  return out;
}

export const isComplete = (s: FieldStatuses): boolean =>
  FIELD_ORDER.every((k) => s[k] === 'ok');

export const hasBad = (s: FieldStatuses): boolean => FIELD_ORDER.some((k) => s[k] === 'bad');

export const missingKeys = (s: FieldStatuses): FieldKey[] =>
  FIELD_ORDER.filter((k) => s[k] !== 'ok');

/** Строки формы → числа. Вызывать только когда все поля в статусе ok. */
export function toParams(form: FormState): AnalysisParams {
  return {
    material: form.material as MaterialType,
    desc: form.desc,
    thickness: +form.thickness,
    o2: +form.o2,
    flow: +form.flow,
    gravity: form.gravity as Gravity,
    temp: +form.temp,
    time: +form.time,
  };
}

/** Параметры анализа → форма (открытие анализа из истории, §5.3). */
export function toForm(p: AnalysisParams): FormState {
  return {
    material: p.material,
    desc: p.desc || '',
    thickness: String(p.thickness),
    o2: String(p.o2),
    flow: String(p.flow),
    flowMode: 'precise',
    gravity: p.gravity,
    temp: String(p.temp),
    time: String(p.time),
  };
}

/**
 * §9.7 — результат устарел, если любое из полей как строка отличается
 * от параметров анализа или сектор отличается от текущего.
 * Описание материала в сравнении не участвует.
 */
const COMPARED = ['material', 'thickness', 'o2', 'flow', 'gravity', 'temp', 'time'] as const;

export function isStale(
  form: FormState,
  params: AnalysisParams,
  analysisSector: SectorId,
  currentSector: SectorId | null,
): boolean {
  const ref = toForm(params);
  return COMPARED.some((k) => ref[k] !== form[k]) || analysisSector !== currentSector;
}

/** §9.3 — предупреждения, не блокирующие расчёт (только при статусе ok). */
export interface Warnings {
  lowO2: boolean;
  noFlow: boolean;
  highFlow: boolean;
}

export function warningsOf(form: FormState, s: FieldStatuses): Warnings {
  return {
    lowO2: s.o2 === 'ok' && pn(form.o2) < 16,
    noFlow: s.flow === 'ok' && pn(form.flow) === 0,
    highFlow: s.flow === 'ok' && pn(form.flow) > 15,
  };
}

export const WARNING_TEXTS = {
  lowO2: 'При такой концентрации кислорода пламя может не поддерживаться',
  noFlow: 'Без потока пламя может быть неустойчивым, особенно в микрогравитации',
  highFlow: 'При очень сильном потоке пламя может сорваться',
} as const;
