/** Справочники и перечисления. FUNCTIONAL_SPEC.md §3, §9.2, §21. */
import type {
  FieldKey,
  Gravity,
  Level,
  MaterialType,
  NumericKey,
  SectorId,
  SectorStatus,
} from './types';

export interface MaterialDef {
  code: MaterialType;
  label: string;
  risk: number;
}

/** §3.1 — порядок отображения как в таблице. */
export const MATERIALS: MaterialDef[] = [
  { code: 'paper', label: 'Бумага', risk: 3 },
  { code: 'fabric', label: 'Ткань', risk: 2 },
  { code: 'plastic', label: 'Пластик', risk: 3 },
  { code: 'wood', label: 'Дерево', risk: 2 },
  { code: 'wire_insulation', label: 'Изоляция провода', risk: 3 },
  { code: 'other', label: 'Другое', risk: 2 },
];

export const MAT: Record<MaterialType, MaterialDef> = Object.fromEntries(
  MATERIALS.map((m) => [m.code, m]),
) as Record<MaterialType, MaterialDef>;

/** §3.3 — пресеты потока для простого режима. */
export const FLOW_PRESETS: { code: string; label: string; value: number }[] = [
  { code: 'none', label: 'Нет', value: 0 },
  { code: 'weak', label: 'Слабый', value: 2.5 },
  { code: 'medium', label: 'Средний', value: 10 },
  { code: 'strong', label: 'Сильный', value: 20 },
];

export const GRAVITY_OPTIONS: { code: Gravity; label: string; short: string }[] = [
  { code: 'earth', label: 'Земля', short: 'Земля' },
  { code: 'microgravity', label: 'Микрогравитация', short: 'μg' },
];

export interface SectorDef {
  id: SectorId;
  code: string;
  name: string;
  desc: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** §3.4 — планировка-заглушка (16.14). [БЭКЕНД] GET /api/sectors. */
export const SECTORS: SectorDef[] = [
  { id: 'sh', code: 'ШЛ', name: 'Шлюз', desc: 'Стыковочный узел и выход наружу.', x: 14, y: 95, w: 80, h: 70 },
  { id: 'km', code: 'КМ', name: 'Командный модуль', desc: 'Посты управления и связи.', x: 104, y: 80, w: 120, h: 100 },
  { id: 'zh', code: 'ЖМ', name: 'Жилой модуль', desc: 'Каюты, камбуз, зона отдыха.', x: 234, y: 60, w: 150, h: 140 },
  { id: 'l1', code: 'ЛБ-1', name: 'Лаборатория 1', desc: 'Научное оборудование и образцы.', x: 394, y: 40, w: 116, h: 85 },
  { id: 'l2', code: 'ЛБ-2', name: 'Лаборатория 2', desc: 'Научное оборудование и образцы.', x: 394, y: 135, w: 116, h: 85 },
  { id: 'sk', code: 'СК', name: 'Склад', desc: 'Грузы, запасы, контейнеры.', x: 520, y: 80, w: 96, h: 100 },
  { id: 'ep', code: 'ЭП', name: 'Энергоотсек', desc: 'Распределение питания, кабельные трассы.', x: 626, y: 95, w: 80, h: 70 },
];

export const SEC: Record<SectorId, SectorDef> = Object.fromEntries(
  SECTORS.map((s) => [s.id, s]),
) as Record<SectorId, SectorDef>;

/** §3.5 — подписи уровней. */
export const RISK_LEVEL_RU: Record<Level, string> = { low: 'Низкий', medium: 'Средний', high: 'Высокий' };
export const EXT_LEVEL_RU: Record<Level, string> = { low: 'Низкая', medium: 'Средняя', high: 'Высокая' };
export const VERDICT_RU: Record<Level, string> = {
  low: 'Безопасно',
  medium: 'Требует внимания',
  high: 'Опасно',
};
export const VERDICT_SUBTITLE: Record<Level, string> = {
  low: 'условия не поддерживают развитие пламени',
  medium: 'возможно развитие или нестабильное горение',
  high: 'высокая вероятность быстрого распространения',
};

/** Короткая подпись статуса на карте. */
export const STATUS_WORD: Record<SectorStatus, string> = {
  none: 'нет данных',
  low: 'норма',
  medium: 'внимание',
  high: 'опасно',
};

/** Подпись статуса в легенде. */
export const STATUS_LEGEND: Record<SectorStatus, string> = {
  none: 'Нет данных',
  low: 'Безопасно',
  medium: 'Внимание',
  high: 'Опасно',
};

/** §9.2 — диапазоны числовых полей. */
export const RANGES: Record<NumericKey, [number, number]> = {
  thickness: [0.05, 10],
  o2: [13, 35],
  flow: [0, 30],
  temp: [20, 300],
  time: [0, 600],
};

/** Шаг ползунка и стрелок (проверка шага не выполняется — 16.22). */
export const STEPS: Record<NumericKey, number> = {
  thickness: 0.05,
  o2: 0.5,
  flow: 0.5,
  temp: 5,
  time: 1,
};

export const FIELD_NAMES: Record<FieldKey, string> = {
  sector: 'Сектор',
  material: 'Материал',
  thickness: 'Толщина',
  o2: 'Кислород',
  flow: 'Поток воздуха',
  gravity: 'Гравитация',
  temp: 'Температура',
  time: 'Время горения',
};

/** Порядок полей = порядок чек-листа и перечисления «Не хватает: …». */
export const FIELD_ORDER: FieldKey[] = [
  'sector',
  'material',
  'thickness',
  'o2',
  'flow',
  'gravity',
  'temp',
  'time',
];

export const UNITS: Record<NumericKey, string> = {
  thickness: ' мм',
  o2: ' %',
  flow: ' см/с',
  temp: ' °C',
  time: ' с',
};

/** §9.3 — сообщения при статусе bad. */
export const RANGE_ERRORS: Record<NumericKey, string> = {
  thickness: 'Допустимо от 0.05 до 10 мм',
  o2: 'Допустимо от 13 до 35 %',
  flow: 'Допустимо от 0 до 30 см/с',
  temp: 'Допустимо от 20 до 300 °C',
  time: 'Допустимо от 0 до 600 с',
};

/** §21.1 — цвета точек статуса. */
export const DOT: Record<SectorStatus, string> = {
  none: 'var(--color-neutral-400)',
  low: 'oklch(0.66 0.1 155)',
  medium: 'oklch(0.78 0.12 88)',
  high: 'oklch(0.5 0.17 28)',
};

/** §21.1 — заливка / текст / обводка сектора на схеме. */
export const MAP_FILL: Record<SectorStatus, [string, string, string]> = {
  none: ['#ebe6e0', 'var(--color-neutral-700)', 'var(--color-neutral-400)'],
  low: ['oklch(0.90 0.05 155)', 'oklch(0.32 0.07 155)', 'oklch(0.62 0.08 155)'],
  medium: ['oklch(0.91 0.08 88)', 'oklch(0.34 0.08 75)', 'oklch(0.68 0.1 85)'],
  high: ['oklch(0.5 0.17 28)', '#fff', 'oklch(0.42 0.17 28)'],
};

export const DANGER_BG = 'oklch(0.5 0.17 28)';
export const WARN_BG = 'oklch(0.78 0.12 88)';
export const WARN_INK = 'oklch(0.30 0.07 75)';
export const WARN_BTN = 'oklch(0.42 0.09 75)';
export const ALERT_INK = 'oklch(0.46 0.1 30)';
export const ALERT_TINT = 'oklch(0.97 0.015 30)';

export interface Signal {
  fill: string;
  tint: string;
  ink: string;
}

/** §21.2 — палитры индикаторов уровня. */
const SIGNAL_COLORS: Record<Level, Signal> = {
  low: { fill: 'oklch(0.74 0.08 155)', tint: 'oklch(0.95 0.025 155)', ink: 'oklch(0.42 0.07 155)' },
  medium: { fill: 'oklch(0.83 0.09 88)', tint: 'oklch(0.96 0.035 90)', ink: 'oklch(0.46 0.08 75)' },
  high: { fill: 'oklch(0.70 0.11 30)', tint: 'oklch(0.95 0.025 30)', ink: 'oklch(0.46 0.12 30)' },
};

const MONO_COLORS: Record<Level, Signal> = {
  low: { fill: 'var(--color-accent-300)', tint: 'var(--color-accent-100)', ink: 'var(--color-accent-700)' },
  medium: { fill: 'var(--color-accent-500)', tint: 'var(--color-accent-200)', ink: 'var(--color-accent-800)' },
  high: { fill: 'var(--color-accent-700)', tint: 'var(--color-accent-300)', ink: 'var(--color-accent-900)' },
};

export type Palette = 'signal' | 'mono';

export const signalOf = (level: Level, palette: Palette = 'signal'): Signal =>
  palette === 'mono' ? MONO_COLORS[level] : SIGNAL_COLORS[level];

/** §3.6 — статус передачи отчёта. */
export const sentFull = (sent: string | null): string =>
  sent ? `Передан на Землю · ${sent}` : 'В очереди на передачу';

export const sentShort = (sent: string | null): string => (sent ? 'передан' : 'в очереди');

export const gravityRu = (g: Gravity): string => (g === 'earth' ? 'Земля' : 'микрогравитация');
export const gravityShort = (g: Gravity): string => (g === 'earth' ? 'Земля' : 'μg');
