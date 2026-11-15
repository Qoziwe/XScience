/** Report for Earth. FUNCTIONAL_SPEC.md §11. */
import { EXT_LEVEL_RU, MAT, RISK_LEVEL_RU, SEC, VERDICT_RU, gravityRu, sentFull } from './reference';
import { f1, pad, reportNo } from './format';
import { score } from './scoring';
import { recommendations, summaryOf } from './texts';
import type { Analysis, ReportDoc } from './types';

const LIMITS =
  'The assessment is built on the rules in section 9; no trained ML model is connected. ' +
  'NASA ranges are not validated. Gravity is accounted for as a category. ' +
  'Recommendations are advisory in nature.';

export function reportDoc(h: Analysis): ReportDoc {
  const s = score(h.p);
  const sec = SEC[h.sector];
  const rc = recommendations(h.p, s, h.sector, h.v);
  const p = h.p;
  const params =
    `${MAT[p.material].label}, ${f1(p.thickness)} mm; O₂ ${f1(p.o2)} %; ` +
    `flow ${f1(p.flow)} cm/s; ${p.temp} °C; ${p.time} s; ${gravityRu(p.gravity)}.`;

  return {
    no: reportNo(h.id),
    analysisId: h.id,
    title: `${sec.code} · ${sec.name}`,
    verdict: VERDICT_RU[h.v],
    verdictKey: h.v,
    meta: [
      { k: 'Sector', v: `${sec.code} · ${sec.name}` },
      { k: 'Generated', v: h.ts },
      { k: 'Author', v: 'AI status module (generation mock-up)' },
      { k: 'Transmission', v: sentFull(h.sent) },
      { k: 'Comm channel', v: 'mock-up, no actual transmission' },
      { k: 'Analysis', v: '#' + pad(h.id) },
    ],
    sections: [
      { h: 'Conclusion', t: `${VERDICT_RU[h.v]}. ${summaryOf(s)}` },
      { h: 'Input Parameters', t: params },
      {
        h: 'Scores',
        t:
          `RiskScore ${s.risk} of 16 (${RISK_LEVEL_RU[s.level].toLowerCase()}); ` +
          `ExtinctionScore ${s.ext} of 8 (${EXT_LEVEL_RU[s.extLevel].toLowerCase()}). ` +
          `Assessment confidence ${h.conf} %.`,
      },
      { h: 'Limitations', t: LIMITS },
    ],
    intro: rc.intro,
    steps: rc.steps,
  };
}

/** §11.3 — TXT format. [BACKEND] GET /api/reports/{id}.txt */
export function reportTxt(d: ReportDoc): string {
  return [
    `REPORT ${d.no}`,
    `Sector: ${d.title}`,
    `Conclusion: ${d.verdict}`,
    '',
    ...d.meta.map((m) => `${m.k}: ${m.v}`),
    '',
    ...d.sections.flatMap((s) => [s.h.toUpperCase(), s.t, '']),
    'RECOMMENDATIONS',
    d.intro,
    ...d.steps.map((s) => `${s.n}. ${s.title} — ${s.detail}`),
  ].join('\n');
}

/** §16.2 — history export to CSV. */
export function historyCsv(hist: Analysis[]): string {
  const head =
    'id,time,sector,material_type,thickness_mm,gravity,oxygen_percent,air_flow_cm_s,temperature_C,time_s,risk_score,risk_level,extinction_score,extinction_probability';
  const rows = hist.map((r) =>
    [
      r.id,
      r.ts,
      r.sector,
      r.p.material,
      r.p.thickness,
      r.p.gravity,
      r.p.o2,
      r.p.flow,
      r.p.temp,
      r.p.time,
      r.risk,
      r.level,
      r.ext,
      r.extLevel,
    ].join(','),
  );
  return [head, ...rows].join('\n');
}
