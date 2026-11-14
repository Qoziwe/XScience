/** Таблицы баллов для вкладки «Правила». FUNCTIONAL_SPEC.md §13. [БЭКЕНД] GET /api/reference. */
import type { PartialScores } from './types';

export interface Band {
  range: string;
  score: number;
  /** Ключ частичного балла, по которому подсвечивается диапазон. */
  on: (t: Partial<PartialScores>, raw: { flow: number }) => boolean;
}

export interface RuleCard {
  name: string;
  code: string;
  /** Какое поле формы показывается как «текущее значение». */
  field: 'material' | 'o2' | 'flow' | 'temp' | 'time' | 'gravity' | 'thickness';
  bands: Band[];
}

const by = (key: keyof PartialScores, value: number): Band['on'] => (t) => t[key] === value;

export const RULE_CARDS: RuleCard[] = [
  {
    name: 'Материал',
    code: 'MaterialRisk',
    field: 'material',
    bands: [
      { range: 'бумага, пластик, изоляция', score: 3, on: by('mat', 3) },
      { range: 'ткань, дерево, другое', score: 2, on: by('mat', 2) },
    ],
  },
  {
    name: 'Кислород',
    code: 'OxygenRisk',
    field: 'o2',
    bands: [
      { range: '< 16 %', score: 0, on: by('o2', 0) },
      { range: '16–18 %', score: 1, on: by('o2', 1) },
      { range: '18–21 % (разрыв 18–19)', score: 2, on: by('o2', 2) },
      { range: '> 21 %', score: 3, on: by('o2', 3) },
    ],
  },
  {
    name: 'Поток',
    code: 'FlowRisk',
    field: 'flow',
    bands: [
      { range: '= 0', score: 1, on: (_t, r) => r.flow === 0 },
      { range: '0–5 см/с', score: 2, on: (_t, r) => r.flow > 0 && r.flow <= 5 },
      { range: '5–15 см/с', score: 3, on: (_t, r) => r.flow > 5 && r.flow <= 15 },
      { range: '15–30 см/с', score: 2, on: (_t, r) => r.flow > 15 },
    ],
  },
  {
    name: 'Температура',
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
    name: 'Время',
    code: 'TimeRisk',
    field: 'time',
    bands: [
      { range: '0–10 с', score: 0, on: by('time', 0) },
      { range: '10–30 с', score: 1, on: by('time', 1) },
      { range: '30–60 с', score: 2, on: by('time', 2) },
      { range: '> 60 с', score: 3, on: by('time', 3) },
    ],
  },
  {
    name: 'Гравитация',
    code: 'GravityRisk',
    field: 'gravity',
    bands: [
      { range: 'микрогравитация', score: 1, on: by('grav', 1) },
      { range: 'Земля', score: 0, on: by('grav', 0) },
    ],
  },
  {
    name: 'Дефицит O₂',
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
    name: 'Слабый поток',
    code: 'LowFlowPenalty',
    field: 'flow',
    bands: [
      { range: '< 1 см/с', score: 2, on: by('lf', 2) },
      { range: '1–3 см/с', score: 1, on: by('lf', 1) },
      { range: '≥ 3 см/с', score: 0, on: by('lf', 0) },
    ],
  },
  {
    name: 'Толщина',
    code: 'ThicknessBonus',
    field: 'thickness',
    bands: [
      { range: '< 0.2 мм', score: 3, on: by('th', 3) },
      { range: '0.2–0.5 мм', score: 2, on: by('th', 2) },
      { range: '0.5–2 мм', score: 1, on: by('th', 1) },
      { range: '> 2 мм', score: 0, on: by('th', 0) },
    ],
  },
];
