/**
 * Implementation of the contract via the Flask API (FUNCTIONAL_SPEC.md §18).
 * The server performs the calculation, texts, and report; the client only sends
 * the raw input §4.1 and receives the finished record §4.2 — screens stay
 * unchanged when switching from localApi.
 */
import { SEC } from '@/domain/reference';
import type { Analysis, AnalysisParams, Level, SectorId } from '@/domain/types';
import type {
  AnalysesApi,
  AuthApi,
  CreateAnalysisResult,
  DatasetApi,
  DatasetRow,
  DatasetSummary,
  ModelsApi,
  NewAnalysis,
  Photo,
  PhotoAnnotation,
  PhotosApi,
  Prediction,
  Readiness,
  SensorsApi,
  SensorsStatus,
  SessionUser,
  TrainResult,
  D2Result,
  XScienceApi,
} from './types';
import { AuthError, NotConfiguredError, ValidationError } from './types';

// Empty (dev) — Vite proxies /api to the backend (vite.config.ts). In production,
// when the frontend and backend are on different hosts (GitHub Pages + its own server),
// it's built with VITE_API_BASE_URL — the backend's full address (see .github/workflows/pages.yml).
const BASE = import.meta.env?.VITE_API_BASE_URL || '/api';
/** History polling period — §11.4 (transmission status change) and other users' analyses. */
const POLL_MS = 1500;
const CSRF_COOKIE = 'xsci_csrf';

/** §4.2 — prototype field names → API field names (§4.1). */
interface AnalysisInputBody {
  sector: SectorId;
  material_type: string;
  material_description: string;
  thickness_mm: number;
  oxygen_percent: number;
  air_flow_cm_s: number;
  gravity: string;
  temperature_C: number;
  time_s: number;
}

/** Prototype parameters → API fields §4.1 without the sector (also needed by the §17.1 forecast). */
const toInputBody = (p: AnalysisParams): Omit<AnalysisInputBody, 'sector'> => ({
  material_type: p.material,
  material_description: p.desc ?? '',
  thickness_mm: p.thickness,
  oxygen_percent: p.o2,
  air_flow_cm_s: p.flow,
  gravity: p.gravity,
  temperature_C: p.temp,
  time_s: p.time,
});

const toInput = (sector: SectorId, p: AnalysisParams): AnalysisInputBody => ({
  sector,
  ...toInputBody(p),
});

/** §18.9 — field names in the 422 response → form field keys (§9.3). */
const FIELD_OF: Record<string, string> = {
  sector: 'sector',
  material_type: 'material',
  material_description: 'material',
  thickness_mm: 'thickness',
  oxygen_percent: 'o2',
  air_flow_cm_s: 'flow',
  gravity: 'gravity',
  temperature_C: 'temp',
  time_s: 'time',
};

const csrfToken = (): string => {
  const m = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : '';
};

interface ApiErrorBody {
  error?: string;
  detail?: string;
  fields?: Record<string, string>;
  attempts_left?: number;
  retry_after_s?: number;
  reasons?: string[];
}

function raise(status: number, body: ApiErrorBody): never {
  const code = body.error ?? 'error';
  if (status === 422 && body.fields) {
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(body.fields)) fields[FIELD_OF[k] ?? k] = v;
    throw new ValidationError(fields);
  }
  const known = ['invalid_credentials', 'invalid_code', 'restart_login', 'locked'] as const;
  if ((status === 401 || status === 429) && (known as readonly string[]).includes(code)) {
    throw new AuthError(code as (typeof known)[number], body.attempts_left, body.retry_after_s);
  }
  // 409/502 — the capability exists in the API but is not configured or not ready
  // on the server (model not trained, recognition not wired up, provider unavailable).
  if (status === 409 || status === 502) {
    throw new NotConfiguredError(code, body.detail ?? body.reasons?.join('; '));
  }
  // 401 without a login-step code — the session expired or doesn't exist (§6.5): this is
  // not a login-form error, screens handle it as a plain request failure.
  throw new Error(`${status} ${code}`);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = init.method ?? 'GET';
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');
  // §6.5 — CSRF token on every mutating request.
  if (method !== 'GET') headers.set('X-CSRF-Token', csrfToken());

  const res = await fetch(BASE + path, { ...init, method, headers, credentials: 'include' });
  if (!res.ok) raise(res.status, (await res.json().catch(() => ({}))) as ApiErrorBody);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** The server's full record (§4.2) → the history record that screens expect. */
interface ServerAnalysis extends Analysis {
  created_at: string;
  report_id: string;
  report_status: string | null;
  acked_at: string | null;
}

const toAnalysis = (r: ServerAnalysis): Analysis => ({
  id: r.id,
  ts: r.ts,
  sector: r.sector,
  p: r.p,
  risk: r.risk,
  ext: r.ext,
  level: r.level,
  extLevel: r.extLevel,
  v: r.v,
  conf: r.conf,
  sent: r.sent,
  acked: !!r.acked_at,
  hasReport: r.report_status != null,
});

/** Records with an unknown sector or material are ignored, as in §16.1. */
const toHistory = (rows: ServerAnalysis[]): Analysis[] =>
  rows
    .filter((r) => !!r && !!SEC[r.sector] && !!r.p)
    .map(toAnalysis)
    .sort((a, b) => a.id - b.id);

class HttpAnalyses implements AnalysesApi {
  private listeners = new Set<(hist: Analysis[]) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private last = '';
  private busy = false;

  /** §18.3 — the list arrives newest-first, but screens expect ascending id order. */
  async list(): Promise<Analysis[]> {
    const rows = await request<ServerAnalysis[]>('/analyses?limit=500');
    const hist = toHistory(rows);
    this.last = JSON.stringify(hist);
    return hist;
  }

  async create({ sector, params }: NewAnalysis): Promise<CreateAnalysisResult> {
    const body = await request<{ analysis: ServerAnalysis; alert_level: Level | null }>(
      '/analyses',
      {
        method: 'POST',
        // §18.3 — guards against duplicates on double-click and retry.
        headers: { 'Idempotency-Key': newKey() },
        body: JSON.stringify(toInput(sector, params)),
      },
    );
    // The server's history changed — notify subscribers without waiting for the next poll.
    void this.poll();
    return { analysis: toAnalysis(body.analysis), alertLevel: body.alert_level };
  }

  /** §10.2 — "Acknowledged" by the operator. Does not change the analysis record itself. */
  async ack(id: number): Promise<void> {
    await request<unknown>(`/analyses/${id}/ack`, { method: 'POST' });
  }

  subscribe(listener: (hist: Analysis[]) => void): () => void {
    this.listeners.add(listener);
    if (!this.timer) this.timer = setInterval(() => void this.poll(), POLL_MS);
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
  }

  /** History polling: subscribers are only notified on an actual change. */
  private async poll(): Promise<void> {
    if (this.busy || !this.listeners.size) return;
    this.busy = true;
    try {
      const rows = await request<ServerAnalysis[]>('/analyses?limit=500');
      const hist = toHistory(rows);
      const next = JSON.stringify(hist);
      if (next !== this.last) {
        this.last = next;
        this.listeners.forEach((l) => l(hist));
      }
    } catch {
      /* network or session unavailable — the next poll will try again */
    } finally {
      this.busy = false;
    }
  }
}

const newKey = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `k-${Date.now()}-${Math.random().toString(16).slice(2)}`;

/** ISO session expiry time → local HH:MM (§5.1). */
const hhmm = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toTimeString().slice(0, 5);
};

class HttpAuth implements AuthApi {
  async login(login: string, password: string) {
    return request<{ stage: 'code_required' }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ login, password }),
    });
  }

  async verifyCode(code: string): Promise<SessionUser> {
    const body = await request<{ user: { login: string; role: string }; expires_at: string }>(
      '/auth/code',
      { method: 'POST', body: JSON.stringify({ code }) },
    );
    return { login: body.user.login, role: body.user.role, expiresAt: hhmm(body.expires_at) };
  }

  async logout(): Promise<void> {
    await request<void>('/auth/logout', { method: 'POST' });
  }

  /** §6.5 — whether a live session exists. A 401 here isn't an error, it means "no session". */
  async me(): Promise<SessionUser | null> {
    try {
      const body = await request<{ login: string; role: string; expires_at: string }>('/me');
      return { login: body.login, role: body.role, expiresAt: hhmm(body.expires_at) };
    } catch {
      return null;
    }
  }
}

/** §17.1–17.2 — ML model and the d² law. */
class HttpModels implements ModelsApi {
  async readiness(): Promise<Readiness> {
    const b = await request<ServerReadiness>('/models/ml/readiness');
    return {
      checks: b.checks,
      mismatches: b.mismatches,
      trainingSet: {
        rows: b.training_set.rows,
        riskClasses: b.training_set.risk_classes,
        extClasses: b.training_set.ext_classes,
        canTrain: b.training_set.can_train,
        reasons: b.training_set.reasons,
        excludedRows: b.training_set.excluded_rows,
        labelsAreRuleDerived: b.training_set.labels_are_rule_derived,
      },
      model: {
        trained: b.model.trained,
        version: b.model.version,
        trainedAt: b.model.trained_at,
        metrics: b.model.metrics ? toMetrics(b.model.metrics) : undefined,
        note: b.model.note,
      },
    };
  }

  async train(): Promise<TrainResult> {
    const b = await request<{ version: string; metrics: ServerMetrics; note: string }>(
      '/models/ml/train',
      { method: 'POST', body: JSON.stringify({}) },
    );
    return { version: b.version, metrics: toMetrics(b.metrics), note: b.note };
  }

  async predict(params: AnalysisParams): Promise<Prediction> {
    const b = await request<{
      model_version: string;
      predictions: Prediction['predictions'];
      note: string;
    }>('/models/ml/predict', {
      method: 'POST',
      body: JSON.stringify(toInputBody(params)),
    });
    return { modelVersion: b.model_version, predictions: b.predictions, note: b.note };
  }

  async d2(d0mm: number, kMm2S: number): Promise<D2Result> {
    const b = await request<{
      t_burn_s: number;
      d0_squared_mm2: number;
      points: D2Result['points'];
    }>('/models/d2', {
      method: 'POST',
      body: JSON.stringify({ d0_mm: d0mm, k_mm2_s: kMm2S }),
    });
    return { tBurnS: b.t_burn_s, d0SquaredMm2: b.d0_squared_mm2, points: b.points };
  }
}

interface ServerMetrics {
  rows: number;
  train_rows: number;
  test_rows: number;
  targets: Record<string, { train_accuracy: number; test_accuracy: number }>;
}

interface ServerReadiness {
  checks: Readiness['checks'];
  mismatches: number;
  training_set: {
    rows: number;
    risk_classes: string[];
    ext_classes: string[];
    can_train: boolean;
    reasons: string[];
    excluded_rows: number;
    labels_are_rule_derived: boolean;
  };
  model: {
    trained: boolean;
    version: string | null;
    trained_at?: string;
    metrics?: ServerMetrics;
    note?: string;
  };
}

const toMetrics = (m: ServerMetrics) => ({
  rows: m.rows,
  trainRows: m.train_rows,
  testRows: m.test_rows,
  targets: Object.fromEntries(
    Object.entries(m.targets).map(([k, v]) => [
      k,
      { trainAccuracy: v.train_accuracy, testAccuracy: v.test_accuracy },
    ]),
  ),
});

/** §18.5 — dataset with cross-checking. */
class HttpDataset implements DatasetApi {
  async load(): Promise<{ summary: DatasetSummary; rows: DatasetRow[] }> {
    const b = await request<{
      summary: {
        rows: number;
        risk_classes: string[];
        earth_rows: number;
        valid_data_source: number;
        mismatches: number;
      };
      rows: ServerDatasetRow[];
    }>('/dataset');
    return {
      summary: {
        rows: b.summary.rows,
        riskClasses: b.summary.risk_classes,
        earthRows: b.summary.earth_rows,
        validDataSource: b.summary.valid_data_source,
        mismatches: b.summary.mismatches,
      },
      rows: b.rows.map((r) => ({
        n: r.n,
        dataset: r.dataset,
        p: r.p,
        flameSizeCm: r.flame_size_cm,
        flameSpreadRateCmS: r.flame_spread_rate_cm_s,
        riskLevel: r.risk_level,
        extinctionProbability: r.extinction_probability,
        expectedResult: r.expected_result,
        computed: r.computed,
        ok: r.ok,
        dataSource: r.data_source,
        dataSourceValid: r.data_source_valid,
      })),
    };
  }
}

interface ServerDatasetRow {
  n: number;
  dataset: string;
  p: AnalysisParams;
  flame_size_cm: string;
  flame_spread_rate_cm_s: string;
  risk_level: Level;
  extinction_probability: Level;
  expected_result: string;
  computed: DatasetRow['computed'];
  ok: boolean;
  data_source: string;
  data_source_valid: boolean;
}

/** §17.3, §18.7 — flame photos. */
class HttpPhotos implements PhotosApi {
  async upload(file: File, analysisId?: number | null): Promise<Photo> {
    const form = new FormData();
    form.append('file', file);
    if (analysisId != null) form.append('analysis_id', String(analysisId));
    // FormData sets its own Content-Type with a boundary — we don't override it.
    const res = await fetch(`${BASE}/photos`, {
      method: 'POST',
      body: form,
      headers: { 'X-CSRF-Token': csrfToken() },
      credentials: 'include',
    });
    if (!res.ok) raise(res.status, (await res.json().catch(() => ({}))) as ApiErrorBody);
    return toPhoto((await res.json()) as ServerPhoto);
  }

  async annotate(id: string, patch: PhotoAnnotation): Promise<Photo> {
    return toPhoto(
      await request<ServerPhoto>(`/photos/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    );
  }

  async recognize(id: string): Promise<Photo> {
    return toPhoto(await request<ServerPhoto>(`/photos/${id}/recognize`, { method: 'POST' }));
  }

  async remove(id: string): Promise<void> {
    await request<void>(`/photos/${id}`, { method: 'DELETE' });
  }
}

interface ServerPhoto {
  id: string;
  file_name: string;
  size_bytes: number;
  mime: string;
  analysis_id: number | null;
  annotation: PhotoAnnotation;
  recognition: (PhotoAnnotation & {
    note: string;
    flame_visible: boolean;
    model: string;
  }) | null;
  file_url: string;
}

const toPhoto = (p: ServerPhoto): Photo => ({
  id: p.id,
  fileName: p.file_name,
  sizeBytes: p.size_bytes,
  mime: p.mime,
  analysisId: p.analysis_id,
  annotation: p.annotation ?? {},
  recognition: p.recognition
    ? {
        size: p.recognition.size ?? undefined,
        brightness: p.recognition.brightness ?? undefined,
        shape: p.recognition.shape ?? undefined,
        note: p.recognition.note,
        flameVisible: p.recognition.flame_visible,
        model: p.recognition.model,
      }
    : null,
  fileUrl: p.file_url,
});

/** [PROTOTYPE] sensor simulation — toggles in the header and the analysis form. */
class HttpSensors implements SensorsApi {
  private listeners = new Set<(s: SensorsStatus) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private last = '';
  private busy = false;

  async status(): Promise<SensorsStatus> {
    const s = await this.fetch();
    this.last = JSON.stringify(s);
    return s;
  }

  async setEnabled(enabled: boolean): Promise<SensorsStatus> {
    const s = toStatus(
      await request<ServerSensorsStatus>('/sensors/toggle', {
        method: 'POST',
        body: JSON.stringify({ enabled }),
      }),
    );
    this.publish(s);
    return s;
  }

  async setManualOverride(enabled: boolean): Promise<SensorsStatus> {
    const s = toStatus(
      await request<ServerSensorsStatus>('/sensors/override', {
        method: 'POST',
        body: JSON.stringify({ enabled }),
      }),
    );
    this.publish(s);
    return s;
  }

  subscribe(listener: (s: SensorsStatus) => void): () => void {
    this.listeners.add(listener);
    if (!this.timer) this.timer = setInterval(() => void this.poll(), POLL_MS);
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
  }

  private async fetch(): Promise<SensorsStatus> {
    return toStatus(await request<ServerSensorsStatus>('/sensors'));
  }

  private publish(s: SensorsStatus): void {
    this.last = JSON.stringify(s);
    this.listeners.forEach((l) => l(s));
  }

  private async poll(): Promise<void> {
    if (this.busy || !this.listeners.size) return;
    this.busy = true;
    try {
      const s = await this.fetch();
      const next = JSON.stringify(s);
      if (next !== this.last) {
        this.last = next;
        this.listeners.forEach((l) => l(s));
      }
    } catch {
      /* network or session unavailable — the next poll will try again */
    } finally {
      this.busy = false;
    }
  }
}

interface ServerSensorsStatus {
  enabled: boolean;
  manual_override: boolean;
}

const toStatus = (s: ServerSensorsStatus): SensorsStatus => ({
  enabled: s.enabled,
  manualOverride: s.manual_override,
});

export const httpApi: XScienceApi = {
  auth: new HttpAuth(),
  analyses: new HttpAnalyses(),
  models: new HttpModels(),
  dataset: new HttpDataset(),
  photos: new HttpPhotos(),
  sensors: new HttpSensors(),
};
