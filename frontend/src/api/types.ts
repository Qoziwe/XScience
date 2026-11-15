/**
 * Client contract with the data source.
 * Implementations: httpApi (Flask API, FUNCTIONAL_SPEC.md §18) and localApi
 * (prototype, calculation in the browser). Screens only ever go through this seam.
 */
import type { Analysis, AnalysisParams, Level, MaterialType, SectorId } from '@/domain/types';

export interface NewAnalysis {
  sector: SectorId;
  params: AnalysisParams;
}

export interface CreateAnalysisResult {
  analysis: Analysis;
  /** §18.3 — null for a "low" verdict; otherwise the verdict, which the client uses to open the alert window. */
  alertLevel: Level | null;
}

export interface AnalysesApi {
  /** GET /api/analyses — in ascending id order. */
  list(): Promise<Analysis[]>;
  /** POST /api/analyses */
  create(input: NewAnalysis): Promise<CreateAnalysisResult>;
  /** History changes (including a change in report transmission status). */
  subscribe(listener: (hist: Analysis[]) => void): () => void;
  /** POST /api/analyses/{id}/ack — "Acknowledged" by the operator (§10.2). */
  ack(id: number): Promise<void>;
}

/** §17.1 — one of the four data-readiness checks. */
export interface ReadinessCheck {
  key: string;
  label: string;
  value: number;
  target: number;
  passed: boolean;
  required: boolean;
  note: string;
}

export interface TrainingSet {
  rows: number;
  riskClasses: string[];
  extClasses: string[];
  canTrain: boolean;
  reasons: string[];
  excludedRows: number;
  /** Dataset labels are computed by the §14 rules — the model approximates them, not the observations. */
  labelsAreRuleDerived: boolean;
}

export interface ModelInfo {
  trained: boolean;
  version: string | null;
  trainedAt?: string;
  metrics?: TrainMetrics;
  note?: string;
}

export interface TargetMetrics {
  trainAccuracy: number;
  testAccuracy: number;
}

export interface TrainMetrics {
  rows: number;
  trainRows: number;
  testRows: number;
  targets: Record<string, TargetMetrics>;
}

export interface Readiness {
  checks: ReadinessCheck[];
  mismatches: number;
  trainingSet: TrainingSet;
  model: ModelInfo;
}

export interface TrainResult {
  version: string;
  metrics: TrainMetrics;
  note: string;
}

export interface Prediction {
  modelVersion: string;
  /** Keys are risk_level and extinction_probability. */
  predictions: Record<string, { label: Level; probabilities: Record<string, number> }>;
  note: string;
}

export interface D2Point {
  t: number;
  d2: number;
  d: number;
}

export interface D2Result {
  tBurnS: number;
  d0SquaredMm2: number;
  points: D2Point[];
}

export interface ModelsApi {
  /** GET /api/models/ml/readiness */
  readiness(): Promise<Readiness>;
  /** POST /api/models/ml/train */
  train(): Promise<TrainResult>;
  /** POST /api/models/ml/predict */
  predict(params: AnalysisParams): Promise<Prediction>;
  /** POST /api/models/d2 */
  d2(d0mm: number, kMm2S: number): Promise<D2Result>;
}

/** A dataset row (§19) with the result of checking it against the §14 formulas. */
export interface DatasetRow {
  n: number;
  dataset: string;
  p: AnalysisParams;
  flameSizeCm: string;
  flameSpreadRateCmS: string;
  riskLevel: Level;
  extinctionProbability: Level;
  expectedResult: string;
  computed: { risk: number; level: Level; ext: number; extLevel: Level };
  ok: boolean;
  dataSource: string;
  dataSourceValid: boolean;
}

export interface DatasetSummary {
  rows: number;
  riskClasses: string[];
  earthRows: number;
  validDataSource: number;
  mismatches: number;
}

export interface DatasetApi {
  /** GET /api/dataset */
  load(): Promise<{ summary: DatasetSummary; rows: DatasetRow[] }>;
}

/** §17.3 — photo attributes. An empty string means the selection was cleared. */
export interface PhotoAnnotation {
  size?: string;
  brightness?: string;
  shape?: string;
}

export interface Recognition extends PhotoAnnotation {
  note: string;
  flameVisible: boolean;
  model: string;
}

export interface Photo {
  id: string;
  fileName: string;
  sizeBytes: number;
  mime: string;
  analysisId: number | null;
  annotation: PhotoAnnotation;
  recognition: Recognition | null;
  fileUrl: string;
}

export interface PhotosApi {
  /** POST /api/photos */
  upload(file: File, analysisId?: number | null): Promise<Photo>;
  /** PATCH /api/photos/{id} */
  annotate(id: string, patch: PhotoAnnotation): Promise<Photo>;
  /** POST /api/photos/{id}/recognize */
  recognize(id: string): Promise<Photo>;
  /** DELETE /api/photos/{id} */
  remove(id: string): Promise<void>;
}

/** Sensor simulation (prototype) — server-side reading generation. */
export interface SensorsStatus {
  enabled: boolean;
  manualOverride: boolean;
}

export interface SensorsApi {
  /** GET /api/sensors */
  status(): Promise<SensorsStatus>;
  /** Status changes (on/off, override). */
  subscribe(listener: (s: SensorsStatus) => void): () => void;
  /** POST /api/sensors/toggle */
  setEnabled(enabled: boolean): Promise<SensorsStatus>;
  /** POST /api/sensors/override */
  setManualOverride(enabled: boolean): Promise<SensorsStatus>;
}

export interface XScienceApi {
  analyses: AnalysesApi;
  /**
   * Sections the prototype doesn't have: localApi doesn't implement them, and
   * screens still work off local constants and an in-memory page snapshot.
   */
  models?: ModelsApi;
  dataset?: DatasetApi;
  photos?: PhotosApi;
  /** Simulation — httpApi only: generation is entirely server-side. */
  sensors?: SensorsApi;
}

/** Input validation error. §18.9 */
export class ValidationError extends Error {
  constructor(
    public fields: Record<string, string>,
    message = 'validation_failed',
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** The requested capability is not configured on the server (§18.9: 409). */
export class NotConfiguredError extends Error {
  constructor(
    public code: string,
    public detail?: string,
  ) {
    super(detail || code);
    this.name = 'NotConfiguredError';
  }
}

/** Dataset row material — for the "Data" tab filters. */
export type DatasetMaterial = MaterialType;
