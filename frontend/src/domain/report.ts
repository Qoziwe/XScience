/** Отчёт для Земли. FUNCTIONAL_SPEC.md §11. */
import { EXT_LEVEL_RU, MAT, RISK_LEVEL_RU, SEC, VERDICT_RU, gravityRu, sentFull } from './reference';
import { f1, pad, reportNo } from './format';
import { score } from './scoring';
import { recommendations, summaryOf } from './texts';
import type { Analysis, ReportDoc } from './types';

const LIMITS =
  'Оценка построена по правилам раздела 9; обученная ML-модель не подключена. ' +
  'Диапазоны NASA не проверены. Гравитация учитывается как категория. ' +
  'Рекомендации носят рекомендательный характер.';

export function reportDoc(h: Analysis): ReportDoc {
  const s = score(h.p);
  const sec = SEC[h.sector];
  const rc = recommendations(h.p, s, h.sector, h.v);
  const p = h.p;
  const params =
    `${MAT[p.material].label}, ${f1(p.thickness)} мм; O₂ ${f1(p.o2)} %; ` +
    `поток ${f1(p.flow)} см/с; ${p.temp} °C; ${p.time} с; ${gravityRu(p.gravity)}.`;

  return {
    no: reportNo(h.id),
    analysisId: h.id,
    title: `${sec.code} · ${sec.name}`,
    verdict: VERDICT_RU[h.v],
    verdictKey: h.v,
    meta: [
      { k: 'Сектор', v: `${sec.code} · ${sec.name}` },
      { k: 'Сформирован', v: h.ts },
      { k: 'Автор', v: 'ИИ-модуль состояния (макет генерации)' },
      { k: 'Передача', v: sentFull(h.sent) },
      { k: 'Канал связи', v: 'макет, реальной передачи нет' },
      { k: 'Анализ', v: '#' + pad(h.id) },
    ],
    sections: [
      { h: 'Заключение', t: `${VERDICT_RU[h.v]}. ${summaryOf(s)}` },
      { h: 'Входные параметры', t: params },
      {
        h: 'Оценки',
        t:
          `RiskScore ${s.risk} из 16 (${RISK_LEVEL_RU[s.level].toLowerCase()}); ` +
          `ExtinctionScore ${s.ext} из 8 (${EXT_LEVEL_RU[s.extLevel].toLowerCase()}). ` +
          `Уверенность оценки ${h.conf} %.`,
      },
      { h: 'Ограничения', t: LIMITS },
    ],
    intro: rc.intro,
    steps: rc.steps,
  };
}

/** §11.3 — формат TXT. [БЭКЕНД] GET /api/reports/{id}.txt */
export function reportTxt(d: ReportDoc): string {
  return [
    `ОТЧЁТ ${d.no}`,
    `Сектор: ${d.title}`,
    `Заключение: ${d.verdict}`,
    '',
    ...d.meta.map((m) => `${m.k}: ${m.v}`),
    '',
    ...d.sections.flatMap((s) => [s.h.toUpperCase(), s.t, '']),
    'РЕКОМЕНДАЦИИ',
    d.intro,
    ...d.steps.map((s) => `${s.n}. ${s.title} — ${s.detail}`),
  ].join('\n');
}

/** §16.2 — выгрузка истории в CSV. */
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
