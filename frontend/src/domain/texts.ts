/**
 * Rule-based text generation. FUNCTIONAL_SPEC.md §15.
 * [BACKEND] replaced by the text module / AI model; the output must contain the same fields.
 * Texts are stored together with the analysis so the report never changes after the fact.
 */
import { EXT_LEVEL_RU, MAT, SEC, VERDICT_RU } from './reference';
import { f1 } from './format';
import { boundaryCount, onOxygenBoundary, BOUNDARIES } from './scoring';
import type {
  AnalysisParams,
  Level,
  MaterialType,
  Note,
  Recommendations,
  Scores,
  SectorId,
} from './types';

/** §15.1 — risk and extinction explanation. */
export function explain(p: AnalysisParams, s: Scores): { why: string; whyExt: string } {
  const t = s.t;
  const parts: string[] = [];
  if (t.mat === 3) parts.push(`${MAT[p.material].label.toLowerCase()} is a highly flammable material`);
  if (t.o2 === 3) parts.push(`oxygen above normal (${f1(p.o2)} %)`);
  if (t.flow === 3) parts.push(`flow of ${f1(p.flow)} cm/s actively feeds the flame`);
  if (t.temp >= 2) parts.push(`high temperature in the combustion zone (${p.temp} °C)`);
  if (t.time >= 2) parts.push(`prolonged burning (${p.time} s)`);
  if (t.grav === 1) parts.push('microgravity increases the uncertainty of flame behavior');

  const why = parts.length
    ? `Risk is increased by: ${parts.join('; ')}.`
    : 'All factors are at minimum values — conditions do not support flame development.';

  const e: string[] = [];
  if (t.od >= 2) e.push(`oxygen deficiency (${f1(p.o2)} %)`);
  if (t.lf >= 1) e.push(p.flow === 0 ? 'no air flow' : 'weak air flow');
  if (t.th >= 2) e.push(`thin material (${f1(p.thickness)} mm)`);

  const whyExt = `Extinction: ${EXT_LEVEL_RU[s.extLevel].toLowerCase()} probability${
    e.length ? ' — ' + e.join(', ') : ', no extinction factors'
  }.`;

  return { why, whyExt };
}

/**
 * §15.2 — conclusion. Always refers to "the sector"
 * (the prototype's "the module" inaccuracy was fixed per the specification).
 */
export function summaryOf(s: Scores): string {
  if (s.level === 'high' && s.extLevel === 'high')
    return 'Combustion is unstable: conditions simultaneously support rapid spread and flame extinguishment. Monitoring is required — reignition is possible after extinguishment.';
  if (s.level === 'high')
    return 'The combination of material, oxygen, and flow creates conditions for rapid flame spread. Extinction is unlikely — intervention is required.';
  if (s.level === 'medium')
    return 'Individual parameters increase the hazard, but conditions for sustained rapid combustion have not developed. Monitoring and addressing the leading factor is sufficient.';
  return 'All factors are at minimum values. There is no threat to the sector at current readings.';
}

/** §15.4 — sector-specific actions. [QUESTION 16.15] not aligned with crew protocols. */
const SECTOR_ACTION: Record<SectorId, [string, string]> = {
  sh: ['Close the airlock hatches', 'Prevent fire and smoke from spreading to adjacent compartments.'],
  km: [
    'Transfer control to the backup station',
    'Preserve ship communication and control until the fire is contained.',
  ],
  zh: ['Evacuate the crew from the sector', 'Gather crew in a safe module and account for everyone.'],
  l1: [
    'Stop the experiment and shut off gas supply',
    'De-energize sector equipment and shut off gas lines.',
  ],
  l2: [
    'Stop the experiment and shut off gas supply',
    'De-energize sector equipment and shut off gas lines.',
  ],
  sk: ['Isolate racks and containers', 'Do not move flammable cargo until the fire is extinguished.'],
  ep: [
    'Switch power to backup lines',
    'Disconnect the damaged bus to preserve power to other sectors.',
  ],
};

/**
 * §15.3–15.4 — the SINGLE recommendation generator.
 * Used by the recommendations window, the report, and the "Recommended Actions" block
 * (which shows the first 3 steps). There is no second, "short" generator.
 */
export function recommendations(
  p: AnalysisParams,
  s: Scores,
  sectorId: SectorId,
  v: Level,
): Recommendations {
  const sec = SEC[sectorId];
  const electrical = p.material === 'wire_insulation' || sectorId === 'ep';
  const st: [string, string][] = [];

  if (electrical)
    st.push([
      'De-energize the line and the heat source',
      'Wiring combustion is sustained by current: as long as the line is live, extinguishing is largely ineffective.',
    ]);
  else if (s.t.temp >= 2)
    st.push([
      'Shut off the heat source',
      `Temperature of ${p.temp} °C in the combustion zone accelerates material heating.`,
    ]);

  if (s.t.o2 === 3 || s.t.flow === 3)
    st.push([
      'Reduce the oxygen supply',
      'Stop sector ventilation and O₂ supply, shut off air ducts.',
    ]);

  if (v !== 'low') st.push(SECTOR_ACTION[sectorId]);

  if (s.level === 'high')
    st.push([
      'Isolate the fire',
      'Separate flammable materials from the fire, prevent flame spread to adjacent sectors.',
    ]);

  if (v !== 'low')
    st.push([
      'Apply the appropriate extinguishing method',
      electrical
        ? 'For electrical equipment — non-aqueous agent only.'
        : 'Choose an agent based on the material type.',
    ]);

  if (s.extLevel === 'high' && v !== 'low')
    st.push([
      'Keep monitoring after the flame goes out',
      'The flame is unstable: reignition is possible.',
    ]);

  if (v === 'low')
    st.push([
      'Continue monitoring',
      'Sector conditions do not support flame development, no action required.',
    ]);

  st.push([
    'Confirm report receipt on Earth',
    'The report is transmitted automatically; report the measures taken.',
  ]);

  return {
    intro:
      `Sector ${sec.code}: ${VERDICT_RU[v].toLowerCase()}. ` +
      `RiskScore ${s.risk} of 16, ExtinctionScore ${s.ext} of 8. ` +
      'Recommendations prepared by the AI module (generation mock-up) and require alignment with onboard protocols.',
    steps: st.map(([title, detail], i) => ({
      n: String(i + 1).padStart(2, '0'),
      title,
      detail,
    })),
  };
}

/** §15.5 — "Calculation Assumptions". */
export function notesOf(p: AnalysisParams, s: Scores): Note[] {
  const notes: Note[] = [];
  if (onOxygenBoundary(p.o2))
    notes.push({
      ref: '16.1',
      text: `O₂ = ${f1(p.o2)} % is on an uncertain boundary: OxygenRisk = ${s.t.o2}, OxygenDeficit = ${s.t.od}.`,
    });
  if (BOUNDARIES.flow.includes(p.flow as never))
    notes.push({
      ref: '16.1',
      text: `Flow ${f1(p.flow)} cm/s is on a range boundary: FlowRisk = ${s.t.flow}, LowFlowPenalty = ${s.t.lf}.`,
    });
  if (BOUNDARIES.temp.includes(p.temp as never))
    notes.push({ ref: '16.1', text: `Temperature ${p.temp} °C is on a boundary: TemperatureRisk = ${s.t.temp}.` });
  if (BOUNDARIES.time.includes(p.time as never))
    notes.push({ ref: '16.1', text: `Time ${p.time} s is on a boundary: TimeRisk = ${s.t.time}.` });
  if (BOUNDARIES.thickness.includes(p.thickness as never))
    notes.push({
      ref: '16.1',
      text: `Thickness ${f1(p.thickness)} mm is on a boundary: ThicknessBonus = ${s.t.th}.`,
    });
  if (p.material === 'other')
    notes.push({
      ref: '16.6',
      text: '"Other": base risk 2, the description is not factored into the calculation.',
    });
  notes.push({
    ref: '16.4',
    text: 'The "low" level is only reachable at RiskScore = 3 — the scale is skewed toward "high".',
  });
  notes.push({
    ref: '—',
    text: 'Gravity is accounted for as a category. No forecast is built from g-level and flame size.',
  });
  return notes;
}

export { boundaryCount };

/** §15.6 — material cards. [QUESTION 16.11] drafts. */
export interface MaterialCard {
  body: string;
  facts: [string, string][];
}

export const MATERIAL_CARDS: Record<MaterialType, MaterialCard> = {
  paper: {
    body: 'A thin cellulose material. Heats up quickly and ignites easily; the flame spreads across the surface of the sheet, especially with a thin layer.',
    facts: [
      ['Found onboard', 'documentation, packaging, filters'],
      ['Main threat', 'rapid spread'],
    ],
  },
  fabric: {
    body: 'Dense fabric heats up more slowly than paper but can smolder and sustain combustion for a long time; the fibers retain heat.',
    facts: [
      ['Found onboard', 'clothing, upholstery, straps'],
      ['Main threat', 'smoldering, hidden combustion'],
    ],
  },
  plastic: {
    body: 'Melts when heated; in microgravity the melt collects into burning droplets that can detach and carry fire. The smoke is toxic.',
    facts: [
      ['Found onboard', 'housings, containers, films'],
      ['Main threat', 'melt droplets, toxic smoke'],
    ],
  },
  wood: {
    body: 'A thick material: requires more heat to warm up and sustain combustion. Chars and can smolder for a long time.',
    facts: [
      ['Found onboard', 'rare; samples, tools'],
      ['Main threat', 'prolonged smoldering'],
    ],
  },
  wire_insulation: {
    body: 'Heats from the inside via current — the heat source stays on. Combustion within wire bundles can be hidden; combustion products are toxic.',
    facts: [
      ['Found onboard', 'cable runs, panels'],
      ['Main threat', 'hidden heating under current'],
    ],
  },
  other: {
    body: 'Properties are not specified. A base risk of 2 is used; what to do when additional properties are present is undefined (16.6).',
    facts: [
      ['Description', ''],
      ['Main threat', 'unknown'],
    ],
  },
};
