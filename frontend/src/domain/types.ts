/** Domain types. Correspond to FUNCTIONAL_SPEC.md §3, §4. */

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

/** Sector status on the map: verdict levels + "no data". */
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

/** Numeric analysis parameters (§4.2, prototype field names). */
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

/** Analysis input for the API (§4.1). */
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

/** Partial scores (§14.1, §14.2). */
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

/** Analysis record (§4.2). Immutable after creation. */
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
  /** null = queued for transmission; a time string = transmitted. */
  sent: string | null;
  /** "Acknowledged" by the operator (§10.2). Optional: the prototype did not store this. */
  acked?: boolean;
  /**
   * Whether the record has a report (§11). Readings from the sensor simulation
   * (httpApi, [PROTOTYPE]) between report cycles have no report — they only
   * move the dashboard without cluttering the "Reports" tab. localApi and
   * regular manual analyses always have a report.
   */
  hasReport?: boolean;
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
