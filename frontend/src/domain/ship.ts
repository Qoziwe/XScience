/** Агрегация состояния корабля. FUNCTIONAL_SPEC.md §7.4. [БЭКЕНД] GET /api/ship/status. */
import { SECTORS, VERDICT_RU } from './reference';
import type { Analysis, Level, SectorId, SectorStatus } from './types';

/** Последний анализ каждого сектора (по порядку истории). */
export function latestBySector(hist: Analysis[]): Partial<Record<SectorId, Analysis>> {
  const last: Partial<Record<SectorId, Analysis>> = {};
  hist.forEach((h) => {
    last[h.sector] = h;
  });
  return last;
}

export interface ShipStatus {
  analysed: number;
  total: number;
  /** Статус каждого сектора (вердикт последнего анализа или 'none'). */
  statusOf: (id: SectorId) => SectorStatus;
  counts: Record<SectorStatus, number>;
  /** Сектора с вердиктом «Опасно». */
  dangers: SectorId[];
  /** Самый свежий (наибольший id) из последних опасных анализов. */
  latestDanger: Analysis | null;
  worst: Level | null;
  verdict: string | null;
  subtitle: string | null;
  summary: string | null;
  confidence: number | null;
  confNote: string | null;
}

export function shipStatus(hist: Analysis[]): ShipStatus {
  const last = latestBySector(hist);
  const statusOf = (id: SectorId): SectorStatus => last[id]?.v ?? 'none';
  const total = SECTORS.length;
  const analysed = Object.keys(last).length;

  const idsWith = (k: SectorStatus) => SECTORS.filter((s) => statusOf(s.id) === k).map((s) => s.id);
  const codesWith = (k: SectorStatus) =>
    SECTORS.filter((s) => statusOf(s.id) === k)
      .map((s) => s.code)
      .join(', ');

  const dangers = idsWith('high');
  const counts: Record<SectorStatus, number> = {
    high: dangers.length,
    medium: idsWith('medium').length,
    low: idsWith('low').length,
    none: total - analysed,
  };

  const latestDanger =
    dangers
      .map((id) => last[id]!)
      .sort((a, b) => b.id - a.id)[0] ?? null;

  if (!analysed) {
    return {
      analysed,
      total,
      statusOf,
      counts,
      dangers,
      latestDanger,
      worst: null,
      verdict: null,
      subtitle: null,
      summary: null,
      confidence: null,
      confNote: null,
    };
  }

  const worst: Level = counts.high ? 'high' : counts.medium ? 'medium' : 'low';
  const coverage = analysed / total;
  const entries = Object.values(last) as Analysis[];
  const confidence = Math.round(
    (entries.reduce((a, e) => a + e.conf, 0) / analysed) * (0.6 + 0.4 * coverage),
  );

  const summary =
    worst === 'high'
      ? `Опасность в секторах: ${codesWith('high')}. ` +
        (counts.medium ? `Внимания требуют: ${codesWith('medium')}. ` : '') +
        'Приоритет — нейтрализовать опасность в указанных секторах.'
      : worst === 'medium'
        ? `Критических секторов нет. Внимания требуют: ${codesWith('medium')}.`
        : 'Во всех проанализированных секторах условия безопасны.';

  return {
    analysed,
    total,
    statusOf,
    counts,
    dangers,
    latestDanger,
    worst,
    verdict: VERDICT_RU[worst],
    subtitle:
      analysed < total ? `по ${analysed} из ${total} секторов — картина неполная` : 'по всем секторам',
    summary,
    confidence,
    confNote:
      analysed < total
        ? 'Снижена: проанализированы не все сектора.'
        : 'Проанализированы все сектора.',
  };
}
