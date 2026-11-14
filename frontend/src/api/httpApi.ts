/**
 * Реализация контракта через Flask API (FUNCTIONAL_SPEC.md §18).
 * Расчёт, тексты и отчёт выполняет сервер; клиент присылает только сырой
 * вход §4.1 и получает готовую запись §4.2 — экраны при переключении
 * с localApi не меняются.
 */
import { SEC } from '@/domain/reference';
import type { Analysis, AnalysisParams, Level, SectorId } from '@/domain/types';
import type {
  AnalysesApi,
  AuthApi,
  CreateAnalysisResult,
  NewAnalysis,
  SessionUser,
  XScienceApi,
} from './types';
import { AuthError, ValidationError } from './types';

const BASE = '/api';
/** Период опроса истории — §11.4 (смена статуса передачи) и чужие анализы. */
const POLL_MS = 1500;
const CSRF_COOKIE = 'xsci_csrf';

/** §4.2 — имена полей прототипа → имена API (§4.1). */
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

const toInput = (sector: SectorId, p: AnalysisParams): AnalysisInputBody => ({
  sector,
  material_type: p.material,
  material_description: p.desc ?? '',
  thickness_mm: p.thickness,
  oxygen_percent: p.o2,
  air_flow_cm_s: p.flow,
  gravity: p.gravity,
  temperature_C: p.temp,
  time_s: p.time,
});

/** §18.9 — имена полей ответа 422 → ключи полей формы (§9.3). */
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
  fields?: Record<string, string>;
  attempts_left?: number;
  retry_after_s?: number;
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
  // 401 без кода шага входа — сессия истекла или её нет (§6.5): это не ошибка
  // формы входа, экраны обрабатывают её как обычный сбой запроса.
  throw new Error(`${status} ${code}`);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = init.method ?? 'GET';
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');
  // §6.5 — CSRF-токен на все изменяющие запросы.
  if (method !== 'GET') headers.set('X-CSRF-Token', csrfToken());

  const res = await fetch(BASE + path, { ...init, method, headers, credentials: 'include' });
  if (!res.ok) raise(res.status, (await res.json().catch(() => ({}))) as ApiErrorBody);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Полная запись сервера (§4.2) → запись истории, которую ждут экраны. */
interface ServerAnalysis extends Analysis {
  created_at: string;
  report_id: string;
  report_status: string | null;
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
});

/** Записи с неизвестным сектором или материалом игнорируются, как в §16.1. */
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

  /** §18.3 — список приходит новыми сверху, экраны ждут по возрастанию id. */
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
        // §18.3 — защита от дублей при двойном клике и ретрае.
        headers: { 'Idempotency-Key': newKey() },
        body: JSON.stringify(toInput(sector, params)),
      },
    );
    // История на сервере изменилась — разослать подписчикам, не дожидаясь опроса.
    void this.poll();
    return { analysis: toAnalysis(body.analysis), alertLevel: body.alert_level };
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

  /** Опрос истории: подписчиков дёргаем только при реальном изменении. */
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
      /* сеть или сессия недоступны — следующий опрос попробует снова */
    } finally {
      this.busy = false;
    }
  }
}

const newKey = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `k-${Date.now()}-${Math.random().toString(16).slice(2)}`;

/** ISO-время окончания сессии → HH:MM локального времени (§5.1). */
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
}

export const httpApi: XScienceApi = {
  auth: new HttpAuth(),
  analyses: new HttpAnalyses(),
};
