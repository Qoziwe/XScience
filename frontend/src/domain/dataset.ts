/** Набор данных. FUNCTIONAL_SPEC.md §19. [БЭКЕНД] GET /api/dataset. */
import { score } from './scoring';
import type { AnalysisParams, Level, MaterialType, Scores } from './types';

/** §19.2 — все строки: gravity = microgravity, data_source = simulated_rule_based. */
const RAW = `paper,0.1,20,2,150,10,3.78,0.14,high,high,possible_extinction
paper,0.2,16,20,40,90,3.42,0.34,high,high,possible_extinction
fabric,0.5,26,0,200,45,5.68,0.21,high,high,possible_extinction
plastic,0.8,15,1,150,120,2.35,0.06,high,high,possible_extinction
wood,2,16,3,40,240,1.72,0.06,high,medium,unstable
wire_insulation,0.4,21,0,250,20,4.85,0.15,high,high,possible_extinction
paper,0.1,18,30,250,10,7.05,1.09,high,high,possible_extinction
paper,0.2,26,25,150,10,7.68,1.47,high,medium,fast_flame_spread
fabric,0.5,18,0,200,30,3.55,0.09,high,high,possible_extinction
plastic,0.8,19,10,60,240,3.42,0.25,high,low,fast_flame_spread
wood,2,16,25,100,240,4.52,0.53,high,medium,unstable
wire_insulation,0.4,28,2,40,300,4.82,0.26,high,medium,fast_flame_spread
paper,0.1,26,30,80,90,7.48,1.67,high,high,fast_flame_spread
paper,0.2,16,20,40,300,3.42,0.34,high,high,possible_extinction
fabric,0.5,15,25,80,180,4.05,0.45,high,high,possible_extinction
plastic,0.8,28,20,150,90,7.72,1.34,high,low,fast_flame_spread
wood,2,22,25,180,90,6.92,1.12,high,low,fast_flame_spread
wire_insulation,0.4,19,3,60,45,2.72,0.11,high,medium,fast_flame_spread
paper,0.1,16,25,100,240,4.52,0.53,high,high,possible_extinction
paper,0.2,22,8,180,60,5.22,0.38,high,medium,fast_flame_spread
fabric,0.5,26,1,40,240,4.18,0.18,high,medium,fast_flame_spread
plastic,0.8,21,2,120,30,3.75,0.15,high,medium,fast_flame_spread
wood,2,22,10,25,20,3.87,0.32,high,low,fast_flame_spread
wire_insulation,0.4,24,25,120,90,6.85,1.21,high,medium,fast_flame_spread
paper,0.1,30,8,250,180,8.05,0.81,high,medium,fast_flame_spread
paper,0.2,26,15,40,20,5.58,0.73,high,medium,fast_flame_spread
fabric,0.5,19,15,40,10,3.72,0.35,high,medium,fast_flame_spread
plastic,0.8,30,5,250,180,7.75,0.61,high,low,fast_flame_spread
wood,2,19,10,120,10,4.02,0.29,high,low,fast_flame_spread
wire_insulation,0.4,22,8,60,300,4.02,0.29,high,medium,fast_flame_spread`;

export interface DatasetRow {
  n: number;
  p: AnalysisParams;
  /** flame_size_cm — выход, правило не задано. */
  size: string;
  /** flame_spread_rate_cm_s — выход, правило не задано. */
  rate: string;
  /** risk_level из файла. */
  risk: Level;
  /** extinction_probability из файла. */
  ext: Level;
  /** expected_result из файла. */
  res: string;
  /** Пересчёт по формулам §14 для сверки. */
  s: Scores;
  /** Совпали и risk_level, и extinction_probability. */
  ok: boolean;
}

export const DATASET: DatasetRow[] = RAW.split('\n').map((line, i) => {
  const a = line.split(',');
  const p: AnalysisParams = {
    material: a[0] as MaterialType,
    desc: '',
    thickness: +a[1],
    gravity: 'microgravity',
    o2: +a[2],
    flow: +a[3],
    temp: +a[4],
    time: +a[5],
  };
  const s = score(p);
  const risk = a[8] as Level;
  const ext = a[9] as Level;
  return {
    n: i + 1,
    p,
    size: a[6],
    rate: a[7],
    risk,
    ext,
    res: a[10],
    s,
    ok: s.level === risk && s.extLevel === ext,
  };
});

export const DATASET_MISMATCHES = DATASET.filter((r) => !r.ok).length;
export const DATASET_RISK_CLASSES = new Set(DATASET.map((r) => r.risk)).size;
