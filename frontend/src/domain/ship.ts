/** Ship status aggregation. FUNCTIONAL_SPEC.md §7.4. [BACKEND] GET /api/ship/status. */
import { SECTORS, VERDICT_RU } from './reference';
import type { Analysis, Level, SectorId, SectorStatus } from './types';

/** The latest analysis for each sector (in history order). */
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
  /** Status of each sector (latest analysis verdict, or 'none'). */
  statusOf: (id: SectorId) => SectorStatus;
  counts: Record<SectorStatus, number>;
  /** Sectors with a "Dangerous" verdict. */
  dangers: SectorId[];
  /** The most recent (highest id) of the latest dangerous analyses. */
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
      ? `Danger in sectors: ${codesWith('high')}. ` +
        (counts.medium ? `Attention required: ${codesWith('medium')}. ` : '') +
        'Priority — neutralize the danger in the listed sectors.'
      : worst === 'medium'
        ? `No critical sectors. Attention required: ${codesWith('medium')}.`
        : 'Conditions are safe in all analyzed sectors.';

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
      analysed < total ? `based on ${analysed} of ${total} sectors — picture is incomplete` : 'based on all sectors',
    summary,
    confidence,
    confNote:
      analysed < total
        ? 'Reduced: not all sectors have been analyzed.'
        : 'All sectors have been analyzed.',
  };
}
