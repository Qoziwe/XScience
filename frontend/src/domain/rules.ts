/** Score tables for the "Rules" tab. FUNCTIONAL_SPEC.md §13. [BACKEND] GET /api/reference. */
import type { PartialScores } from './types';

export interface Band {
  range: string;
  score: number;
  /** Partial-score key that highlights the range. */
  on: (t: Partial<PartialScores>, raw: { flow: number }) => boolean;
}

export interface RuleCard {
  name: string;
  code: string;
  /** Which form field is shown as the "current value". */
  field: 'material' | 'o2' | 'flow' | 'temp' | 'time' | 'gravity' | 'thickness';
  bands: Band[];
}

const by = (key: keyof PartialScores, value: number): Band['on'] => (t) => t[key] === value;

export const RULE_CARDS: RuleCard[] = [
  {
    name: 'Material',
    code: 'MaterialRisk',
    field: 'material',
    bands: [
      { range: 'paper, plastic, insulation', score: 3, on: by('mat', 3) },
      { range: 'fabric, wood, other', score: 2, on: by('mat', 2) },
    ],
  },
  {
    name: 'Oxygen',
    code: 'OxygenRisk',
    field: 'o2',
    bands: [
      { range: '< 16 %', score: 0, on: by('o2', 0) },
      { range: '16–18 %', score: 1, on: by('o2', 1) },
      { range: '18–21 % (18–19 gap)', score: 2, on: by('o2', 2) },
      { range: '> 21 %', score: 3, on: by('o2', 3) },
    ],
  },
  {
    name: 'Flow',
    code: 'FlowRisk',
    field: 'flow',
    bands: [
      { range: '= 0', score: 1, on: (_t, r) => r.flow === 0 },
      { range: '0–5 cm/s', score: 2, on: (_t, r) => r.flow > 0 && r.flow <= 5 },
      { range: '5–15 cm/s', score: 3, on: (_t, r) => r.flow > 5 && r.flow <= 15 },
      { range: '15–30 cm/s', score: 2, on: (_t, r) => r.flow > 15 },
    ],
  },
  {
    name: 'Temperature',
    code: 'TemperatureRisk',
    field: 'temp',
    bands: [
      { range: '20–50 °C', score: 0, on: by('temp', 0) },
      { range: '50–100 °C', score: 1, on: by('temp', 1) },
      { range: '100–200 °C', score: 2, on: by('temp', 2) },
      { range: '> 200 °C', score: 3, on: by('temp', 3) },
    ],
  },
  {
    name: 'Time',
    code: 'TimeRisk',
    field: 'time',
    bands: [
      { range: '0–10 s', score: 0, on: by('time', 0) },
      { range: '10–30 s', score: 1, on: by('time', 1) },
      { range: '30–60 s', score: 2, on: by('time', 2) },
      { range: '> 60 s', score: 3, on: by('time', 3) },
    ],
  },
  {
    name: 'Gravity',
    code: 'GravityRisk',
    field: 'gravity',
    bands: [
      { range: 'microgravity', score: 1, on: by('grav', 1) },
      { range: 'Earth', score: 0, on: by('grav', 0) },
    ],
  },
  {
    name: 'O₂ Deficit',
    code: 'OxygenDeficit',
    field: 'o2',
    bands: [
      { range: '< 16 %', score: 3, on: by('od', 3) },
      { range: '16–18 %', score: 2, on: by('od', 2) },
      { range: '18–19 %', score: 1, on: by('od', 1) },
      { range: '≥ 19 %', score: 0, on: by('od', 0) },
    ],
  },
  {
    name: 'Weak Flow',
    code: 'LowFlowPenalty',
    field: 'flow',
    bands: [
      { range: '< 1 cm/s', score: 2, on: by('lf', 2) },
      { range: '1–3 cm/s', score: 1, on: by('lf', 1) },
      { range: '≥ 3 cm/s', score: 0, on: by('lf', 0) },
    ],
  },
  {
    name: 'Thickness',
    code: 'ThicknessBonus',
    field: 'thickness',
    bands: [
      { range: '< 0.2 mm', score: 3, on: by('th', 3) },
      { range: '0.2–0.5 mm', score: 2, on: by('th', 2) },
      { range: '0.5–2 mm', score: 1, on: by('th', 1) },
      { range: '> 2 mm', score: 0, on: by('th', 0) },
    ],
  },
];
