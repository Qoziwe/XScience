/**
 * Local implementation of the contract: everything runs in the browser.
 * FUNCTIONAL_SPEC.md §2.1, §16.1 — localStorage, key xsci.hist.v3, up to 100 records.
 * [PROTOTYPE] calculation, texts, and "transmission to Earth" are simulated here.
 */
import { MAT, SEC } from '@/domain/reference';
import { now } from '@/domain/format';
import { confidenceOf, score, verdictOfScores } from '@/domain/scoring';
import type { Analysis, AnalysisParams, SectorId } from '@/domain/types';
import type {
  AnalysesApi,
  AuthApi,
  CreateAnalysisResult,
  NewAnalysis,
  SessionUser,
  XScienceApi,
} from './types';
import { AuthError } from './types';

const KEY = 'xsci.hist.v3';
/** Prototype session: survives a reload so /console doesn't bounce back to login. */
const SESSION_KEY = 'xsci.session.v1';
/** §9.5 — simulated calculation time. [BACKEND] not needed. */
const CALC_DELAY_MS = 650;
/** §11.4 — simulated transmission of the report to Earth. */
const SEND_DELAY_MS = 2500;
const HISTORY_LIMIT = 100;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** §16.1 — records without a valid sector / p / p.material are discarded. */
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
    /* storage unavailable — history lives only in the page's memory */
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
    // §11.4 — on page load the transmission timer restarts
    // for every record with "queued" status.
    this.hist.filter((h) => !h.sent).forEach((h) => this.queueSend(h.id));
  }

  async list(): Promise<Analysis[]> {
    return this.hist;
  }

  /** [PROTOTYPE] "Acknowledged" is only marked in the browser history. */
  async ack(id: number): Promise<void> {
    this.commit(this.hist.map((h) => (h.id === id ? { ...h, acked: true } : h)));
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
    // §10.1 — the alert window opens for a medium or high verdict.
    return { analysis, alertLevel: analysis.v === 'low' ? null : analysis.v };
  }

  /** §11.4 [MOCK-UP] — after 2.5 s the report is marked as transmitted. */
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

/** §6 [PROTOTYPE] — demo account hardcoded in client code. [BACKEND] see §6.5. */
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
    const user: SessionUser = {
      login: DEMO.login,
      role: 'operator',
      expiresAt: d.toTimeString().slice(0, 5),
    };
    writeSession({ user, until: d.getTime() });
    return user;
  }

  async logout() {
    this.stage = 'none';
    writeSession(null);
  }

  /** Prototype session from localStorage; null once it has expired. */
  async me(): Promise<SessionUser | null> {
    const s = readSession();
    if (!s) return null;
    if (Date.now() > s.until) {
      writeSession(null);
      return null;
    }
    return s.user;
  }
}

interface StoredSession {
  user: SessionUser;
  until: number;
}

function readSession(): StoredSession | null {
  try {
    const raw = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null');
    return raw && raw.user && typeof raw.until === 'number' ? (raw as StoredSession) : null;
  } catch {
    return null;
  }
}

function writeSession(s: StoredSession | null): void {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable — session lives only in the page's memory */
  }
}

/**
 * The prototype does not implement the models / dataset / photos sections: it has no server.
 * Screens account for this and work off local constants §19/§17 and an
 * in-memory page snapshot (§17.3).
 */
export const localApi: XScienceApi = {
  auth: new LocalAuth(),
  analyses: new LocalAnalyses(),
};
