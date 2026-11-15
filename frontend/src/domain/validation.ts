/**
 * Form validation. FUNCTIONAL_SPEC.md §9.3.
 * Form values are stored as strings (empty string = not filled in).
 * [BACKEND] repeats these rules independently of the client and responds with 422 (§18.9).
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
  /** UI state, not saved into the analysis (§3.3). */
  flowMode: 'simple' | 'precise';
  gravity: Gravity | null;
  temp: string;
  time: string;
}

/** §9.1 — empty form state. Flow mode defaults to "Precise". */
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

/** Form strings → numbers. Call only when all fields have status ok. */
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

/** Analysis parameters → form (opening an analysis from history, §5.3). */
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
 * §9.7 — the result is stale if any field, as a string, differs
 * from the analysis parameters, or the sector differs from the current one.
 * The material description does not participate in the comparison.
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

/** §9.3 — warnings that do not block the calculation (only when status is ok). */
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
  lowO2: 'At this oxygen concentration the flame may not be sustained',
  noFlow: 'Without air flow the flame may be unstable, especially in microgravity',
  highFlow: 'At very high flow the flame may be extinguished',
} as const;
