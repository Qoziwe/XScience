/**
 * Локальная реализация контракта: всё в браузере.
 * FUNCTIONAL_SPEC.md §2.1, §16.1 — localStorage, ключ xsci.hist.v3, до 100 записей.
 * [ПРОТОТИП] расчёт, тексты и «передача на Землю» имитируются здесь.
 */
import { MAT, SEC } from '@/domain/reference';
import { now } from '@/domain/format';
import { confidenceOf, score, verdictOfScores } from '@/domain/scoring';
import type { Analysis, AnalysisParams, SectorId } from '@/domain/types';
import type { AnalysesApi, AuthApi, CreateAnalysisResult, NewAnalysis, XScienceApi } from './types';
import { AuthError } from './types';

const KEY = 'xsci.hist.v3';
/** §9.5 — имитация времени расчёта. [БЭКЕНД] не нужна. */
const CALC_DELAY_MS = 650;
/** §11.4 — имитация передачи отчёта на Землю. */
const SEND_DELAY_MS = 2500;
const HISTORY_LIMIT = 100;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** §16.1 — записи без корректного sector / p / p.material отбрасываются. */
function readHistory(): Analysis[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (x: unknown): x is Analysis =>
        !!x &&
        typeof x === 'object' &&
        !!SEC[(x as Analysis).sector as SectorId] &&
        !!(x as Analysis).p &&
        !!MAT[(x as Analysis).p?.material],
    );
  } catch {
    return [];
  }
}

function writeHistory(hist: Analysis[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(hist));
  } catch {
    /* хранилище недоступно — история живёт только в памяти страницы */
  }
}

function makeAnalysis(p: AnalysisParams, id: number, ts: string, sector: SectorId): Analysis {
  const s = score(p);
  return {
    id,
    ts,
    sector,
    p: { ...p },
    risk: s.risk,
    ext: s.ext,
    level: s.level,
    extLevel: s.extLevel,
    v: verdictOfScores(s),
    conf: confidenceOf(p),
    sent: null,
  };
}

class LocalAnalyses implements AnalysesApi {
  private hist: Analysis[] = readHistory();
  private listeners = new Set<(hist: Analysis[]) => void>();
  private timers = new Set<ReturnType<typeof setTimeout>>();

  constructor() {
    // §11.4 — при загрузке страницы таймер передачи запускается заново
    // для всех записей со статусом «в очереди».
    this.hist.filter((h) => !h.sent).forEach((h) => this.queueSend(h.id));
  }

  async list(): Promise<Analysis[]> {
    return this.hist;
  }

  subscribe(listener: (hist: Analysis[]) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async create({ sector, params }: NewAnalysis): Promise<CreateAnalysisResult> {
    await sleep(CALC_DELAY_MS);
    const id = this.hist.reduce((m, h) => Math.max(m, h.id), 0) + 1;
    const analysis = makeAnalysis(params, id, now(), sector);
    this.commit([...this.hist, analysis].slice(-HISTORY_LIMIT));
    this.queueSend(id);
    // §10.1 — окно оповещения открывается при вердикте medium и high.
    return { analysis, alertLevel: analysis.v === 'low' ? null : analysis.v };
  }

  /** §11.4 [МАКЕТ] — через 2.5 с отчёт помечается переданным. */
  private queueSend(id: number): void {
    const t = setTimeout(() => {
      this.timers.delete(t);
      this.commit(this.hist.map((h) => (h.id === id && !h.sent ? { ...h, sent: now() } : h)));
    }, SEND_DELAY_MS);
    this.timers.add(t);
  }

  private commit(hist: Analysis[]): void {
    this.hist = hist;
    writeHistory(hist);
    this.listeners.forEach((l) => l(hist));
  }

  dispose(): void {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
  }
}

/** §6 [ПРОТОТИП] — демо-учётка в коде клиента. [БЭКЕНД] см. §6.5. */
const DEMO = { login: 'demo', password: 'xscience-demo', code: '123456' };

class LocalAuth implements AuthApi {
  private stage: 'none' | 'password_ok' = 'none';

  async login(login: string, password: string) {
    if (login.trim() === DEMO.login && password === DEMO.password) {
      this.stage = 'password_ok';
      return { stage: 'code_required' as const };
    }
    throw new AuthError('invalid_credentials');
  }

  async verifyCode(code: string) {
    if (this.stage !== 'password_ok') throw new AuthError('restart_login');
    if (code !== DEMO.code) throw new AuthError('invalid_code');
    const d = new Date(Date.now() + 8 * 3600e3);
    return { login: DEMO.login, role: 'operator', expiresAt: d.toTimeString().slice(0, 5) };
  }

  async logout() {
    this.stage = 'none';
  }
}

export const localApi: XScienceApi = {
  auth: new LocalAuth(),
  analyses: new LocalAnalyses(),
};
