/**
 * Контракт клиента с источником данных.
 * Реализации: httpApi (Flask API, FUNCTIONAL_SPEC.md §18) и localApi
 * (прототип, расчёт в браузере). Экраны работают только через этот шов.
 */
import type { Analysis, AnalysisParams, Level, MaterialType, SectorId } from '@/domain/types';

export interface NewAnalysis {
  sector: SectorId;
  params: AnalysisParams;
}

export interface CreateAnalysisResult {
  analysis: Analysis;
  /** §18.3 — null при вердикте low; иначе вердикт, по нему клиент открывает окно оповещения. */
  alertLevel: Level | null;
}

export interface LoginResult {
  stage: 'code_required';
}

export interface SessionUser {
  login: string;
  role: string;
  /** HH:MM — до какого времени активна сессия. */
  expiresAt: string;
}

export interface AuthApi {
  /** POST /api/auth/login */
  login(login: string, password: string): Promise<LoginResult>;
  /** POST /api/auth/code */
  verifyCode(code: string): Promise<SessionUser>;
  /** POST /api/auth/logout */
  logout(): Promise<void>;
  /** GET /api/me — null, если сессии нет (§6.5). Этим защищён маршрут /console. */
  me(): Promise<SessionUser | null>;
}

export interface AnalysesApi {
  /** GET /api/analyses — по возрастанию id. */
  list(): Promise<Analysis[]>;
  /** POST /api/analyses */
  create(input: NewAnalysis): Promise<CreateAnalysisResult>;
  /** Изменения истории (включая смену статуса передачи отчёта). */
  subscribe(listener: (hist: Analysis[]) => void): () => void;
  /** POST /api/analyses/{id}/ack — «Принято» оператором (§10.2). */
  ack(id: number): Promise<void>;
}

/** §17.1 — одна из четырёх проверок готовности данных. */
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
  /** Метки набора посчитаны правилами §14 — модель приближает их, а не наблюдения. */
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
  /** Ключи — risk_level и extinction_probability. */
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

/** Строка набора данных (§19) с результатом сверки по формулам §14. */
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

/** §17.3 — признаки снимка. Пустая строка = выбор снят. */
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
  /** Путь к самому снимку; отдаётся только по сессии. */
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

export interface XScienceApi {
  auth: AuthApi;
  analyses: AnalysesApi;
  /**
   * Разделы, которых нет у прототипа: localApi их не реализует, и экраны
   * работают по-прежнему на локальных константах и снимке в памяти страницы.
   */
  models?: ModelsApi;
  dataset?: DatasetApi;
  photos?: PhotosApi;
}

/** Ошибка валидации входа. §18.9 */
export class ValidationError extends Error {
  constructor(
    public fields: Record<string, string>,
    message = 'validation_failed',
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class AuthError extends Error {
  constructor(
    public code: 'invalid_credentials' | 'invalid_code' | 'restart_login' | 'locked',
    public attemptsLeft?: number,
    public retryAfterS?: number,
  ) {
    super(code);
    this.name = 'AuthError';
  }
}

/** Запрошенная возможность на сервере не настроена (§18.9: 409). */
export class NotConfiguredError extends Error {
  constructor(
    public code: string,
    public detail?: string,
  ) {
    super(detail || code);
    this.name = 'NotConfiguredError';
  }
}

/** Материал строки набора данных — для фильтров вкладки «Данные». */
export type DatasetMaterial = MaterialType;
