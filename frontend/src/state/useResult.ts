/** Производная модель активного результата. FUNCTIONAL_SPEC.md §9.7, §9.8. */
import { useMemo } from 'react';
import { signalOf, type Signal } from '@/domain/reference';
import { score } from '@/domain/scoring';
import { confidenceNote, boundaryCount } from '@/domain/scoring';
import { explain, notesOf, recommendations, summaryOf } from '@/domain/texts';
import { isStale } from '@/domain/validation';
import { verdictOfScores } from '@/domain/scoring';
import type { Analysis, Level, Note, Recommendations, Scores } from '@/domain/types';
import { useStore } from './store';

export interface ResultModel {
  entry: Analysis;
  scores: Scores;
  verdict: Level;
  signal: Signal;
  verdictSignal: Signal;
  stale: boolean;
  why: string;
  whyExt: string;
  summary: string;
  confNote: string;
  boundaries: number;
  notes: Note[];
  recs: Recommendations;
  /** Плашка 16.2: высокий риск при высокой вероятности затухания. */
  combo: boolean;
}

export function useResult(): ResultModel | null {
  const { state } = useStore();
  const { hist, activeId, form, cur, tweaks } = state;

  return useMemo(() => {
    const entry = hist.find((h) => h.id === activeId);
    if (!entry) return null;
    const scores = score(entry.p);
    const verdict = verdictOfScores(scores);
    const { why, whyExt } = explain(entry.p, scores);
    return {
      entry,
      scores,
      verdict,
      signal: signalOf(scores.level, tweaks.palette),
      verdictSignal: signalOf(verdict, tweaks.palette),
      stale: isStale(form, entry.p, entry.sector, cur),
      why,
      whyExt,
      summary: summaryOf(scores),
      confNote: confidenceNote(entry.p),
      boundaries: boundaryCount(entry.p),
      notes: notesOf(entry.p, scores),
      recs: recommendations(entry.p, scores, entry.sector, verdict),
      combo: scores.level === 'high' && scores.extLevel === 'high',
    };
  }, [hist, activeId, form, cur, tweaks.palette]);
}

/** Модель анализа для окна оповещения/рекомендаций (§10). */
export function useModalModel() {
  const { state } = useStore();
  const { hist, modal, tweaks } = state;

  return useMemo(() => {
    if (!modal) return null;
    const entry = hist.find((h) => h.id === modal.id);
    if (!entry) return null;
    const scores = score(entry.p);
    const { why, whyExt } = explain(entry.p, scores);
    return {
      entry,
      scores,
      view: modal.view,
      why: `${why} ${whyExt}`,
      recs: recommendations(entry.p, scores, entry.sector, entry.v),
      signal: signalOf(entry.v, tweaks.palette),
    };
  }, [hist, modal, tweaks.palette]);
}
