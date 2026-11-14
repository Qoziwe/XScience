/** Типы предметной области. Соответствуют FUNCTIONAL_SPEC.md §3, §4. */

export type MaterialType =
  | 'paper'
  | 'fabric'
  | 'plastic'
  | 'wood'
  | 'wire_insulation'
  | 'other';

export type Gravity = 'earth' | 'microgravity';

export type SectorId = 'sh' | 'km' | 'zh' | 'l1' | 'l2' | 'sk' | 'ep';

export type Level = 'low' | 'medium' | 'high';

/** Статус сектора на карте: уровни вердикта + «нет данных». */
export type SectorStatus = Level | 'none';

export type FieldKey =
  | 'sector'
  | 'material'
  | 'thickness'
  | 'o2'
  | 'flow'
  | 'gravity'
  | 'temp'
  | 'time';

export type NumericKey = 'thickness' | 'o2' | 'flow' | 'temp' | 'time';

export type FieldStatus = 'ok' | 'empty' | 'bad';

/** Числовые параметры анализа (§4.2, имена полей прототипа). */
export interface AnalysisParams {
  material: MaterialType;
  desc: string;
  thickness: number;
  o2: number;
  flow: number;
  gravity: Gravity;
  temp: number;
  time: number;
}

/** Вход анализа для API (§4.1). */
export interface AnalysisInput {
  sector: SectorId;
  material_type: MaterialType;
  material_description: string;
  thickness_mm: number;
  oxygen_percent: number;
  air_flow_cm_s: number;
  gravity: Gravity;
  temperature_C: number;
  time_s: number;
}

/** Частичные баллы (§14.1, §14.2). */
export interface PartialScores {
  mat: number;
  o2: number;
  flow: number;
  temp: number;
  time: number;
  grav: number;
  od: number;
  lf: number;
  th: number;
}

export interface Scores {
  t: PartialScores;
  risk: number;
  ext: number;
  level: Level;
  extLevel: Level;
}

/** Запись анализа (§4.2). Неизменяема после создания. */
export interface Analysis {
  id: number;
  ts: string;
  sector: SectorId;
  p: AnalysisParams;
  risk: number;
  ext: number;
  level: Level;
  extLevel: Level;
  v: Level;
  conf: number;
  /** null = в очереди на передачу; строка времени = передан. */
  sent: string | null;
  /** «Принято» оператором (§10.2). Необязательно: прототип это не хранил. */
  acked?: boolean;
}

export interface RecStep {
  n: string;
  title: string;
  detail: string;
}

export interface Recommendations {
  intro: string;
  steps: RecStep[];
}

export interface Note {
  ref: string;
  text: string;
}

export interface ReportMeta {
  k: string;
  v: string;
}

export interface ReportSection {
  h: string;
  t: string;
}

export interface ReportDoc {
  no: string;
  analysisId: number;
  title: string;
  verdict: string;
  verdictKey: Level;
  meta: ReportMeta[];
  sections: ReportSection[];
  intro: string;
  steps: RecStep[];
}
