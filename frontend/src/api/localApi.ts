/**
 * Local implementation of the contract: everything runs in the browser.
 * FUNCTIONAL_SPEC.md §2.1, §16.1 — localStorage, key xsci.hist.v3, up to 100 records.
 * [PROTOTYPE] calculation, texts, and "transmission to Earth" are simulated here.
 */
import { MAT, SEC } from '@/domain/reference';
import { now } from '@/domain/format';
import { confidenceOf, score, verdictOfScores } from '@/domain/scoring';
import type { Analysis, AnalysisParams, SectorId } from '@/domain/types';
import type { AnalysesApi, CreateAnalysisResult, NewAnalysis, XScienceApi } from './types';

const KEY = 'xsci.hist.v3';
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

/**
 * The prototype does not implement the models / dataset / photos sections: it has no server.
 * Screens account for this and work off local constants §19/§17 and an
 * in-memory page snapshot (§17.3).
 */
export const localApi: XScienceApi = {
  analyses: new LocalAnalyses(),
};
