/**
 * Расчёт риска, затухания, вердикта и уверенности.
 * FUNCTIONAL_SPEC.md §14 — единственный источник истины.
 * [БЭКЕНД] этот модуль переносится на сервер (модуль расчёта Flask) без изменений логики.
 */
import { MAT } from './reference';
import type { AnalysisParams, Level, PartialScores, Scores } from './types';

/** §14.1 */
export const oxygenRisk = (o2: number): number => (o2 < 16 ? 0 : o2 <= 18 ? 1 : o2 <= 21 ? 2 : 3);
export const flowRisk = (v: number): number => (v === 0 ? 1 : v <= 5 ? 2 : v <= 15 ? 3 : 2);
export const temperatureRisk = (t: number): number => (t <= 50 ? 0 : t <= 100 ? 1 : t <= 200 ? 2 : 3);
export const timeRisk = (s: number): number => (s <= 10 ? 0 : s <= 30 ? 1 : s <= 60 ? 2 : 3);
export const gravityRisk = (g: string): number => (g === 'microgravity' ? 1 : 0);

/** §14.2 */
export const oxygenDeficit = (o2: number): number => (o2 < 16 ? 3 : o2 < 18 ? 2 : o2 < 19 ? 1 : 0);
export const lowFlowPenalty = (v: number): number => (v < 1 ? 2 : v < 3 ? 1 : 0);
export const thicknessBonus = (mm: number): number => (mm < 0.2 ? 3 : mm <= 0.5 ? 2 : mm <= 2 ? 1 : 0);

/** §14.3 */
export const riskLevel = (r: number): Level => (r <= 3 ? 'low' : r <= 6 ? 'medium' : 'high');
export const extinctionLevel = (e: number): Level => (e >= 4 ? 'high' : e >= 2 ? 'medium' : 'low');

export function score(p: AnalysisParams): Scores {
  const t: PartialScores = {
    mat: MAT[p.material].risk,
    o2: oxygenRisk(p.o2),
    flow: flowRisk(p.flow),
    temp: temperatureRisk(p.temp),
    time: timeRisk(p.time),
    grav: gravityRisk(p.gravity),
    od: oxygenDeficit(p.o2),
    lf: lowFlowPenalty(p.flow),
    th: thicknessBonus(p.thickness),
  };
  const risk = t.mat + t.o2 + t.flow + t.temp + t.time + t.grav;
  const ext = t.od + t.lf + t.th;
  return { t, risk, ext, level: riskLevel(risk), extLevel: extinctionLevel(ext) };
}

/** §14.4 — поправка на устойчивость пламени. */
export const stabilityAdjust = (ext: number): number => (ext <= 1 ? 2 : ext >= 4 ? -1 : 0);

/** §14.4 — индекс опасности D (2..18). */
export const dangerIndex = (risk: number, ext: number): number => risk + stabilityAdjust(ext);

/** §14.4 — вердикт состояния по индексу опасности. */
export function verdictOf(risk: number, ext: number): Level {
  const d = dangerIndex(risk, ext);
  return d >= 10 ? 'high' : d >= 6 ? 'medium' : 'low';
}

export const verdictOfScores = (s: Scores): Level => verdictOf(s.risk, s.ext);

/** §14.5 — неопределённые границы (16.1). Точное сравнение чисел. */
export const BOUNDARIES = {
  o2: [16, 18, 19, 21],
  flow: [1, 5, 15],
  temp: [50, 100, 200],
  time: [10, 30, 60],
  thickness: [0.5, 2],
} as const;

export const onOxygenBoundary = (o2: number): boolean =>
  BOUNDARIES.o2.includes(o2 as never) || (o2 > 18 && o2 < 19);

export function boundaryCount(p: AnalysisParams): number {
  let n = 0;
  if (onOxygenBoundary(p.o2)) n++;
  if (BOUNDARIES.flow.includes(p.flow as never)) n++;
  if (BOUNDARIES.temp.includes(p.temp as never)) n++;
  if (BOUNDARIES.time.includes(p.time as never)) n++;
  if (BOUNDARIES.thickness.includes(p.thickness as never)) n++;
  return n;
}

/** §14.5 — эвристика уверенности интерфейса, 45..94. */
export function confidenceOf(p: AnalysisParams): number {
  let c = 94;
  c -= 8 * boundaryCount(p);
  if (p.material === 'other') c -= 14;
  if (p.o2 > 30 || p.flow > 15) c -= 10;
  return Math.max(45, Math.min(94, c));
}

/** Причины снижения уверенности — для пояснения под полосой. */
export function confidenceReasons(p: AnalysisParams): string[] {
  const r: string[] = [];
  const bnd = boundaryCount(p);
  if (bnd) r.push(`${bnd} знач. на неопределённых границах (16.1)`);
  if (p.material === 'other') r.push('свойства материала не заданы');
  if (p.o2 > 30 || p.flow > 15) r.push('значения вне проверенных диапазонов NASA (16.13)');
  return r;
}

export const confidenceNote = (p: AnalysisParams): string => {
  const r = confidenceReasons(p);
  return r.length ? `Снижена: ${r.join('; ')}.` : 'Все показания в определённых диапазонах.';
};

/** Зона шкалы RiskScore для значения 3..16 (§9.7). */
export const riskZone = (n: number): Level => (n <= 3 ? 'low' : n <= 6 ? 'medium' : 'high');
