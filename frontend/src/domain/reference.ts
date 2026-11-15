/** Reference tables and enumerations. FUNCTIONAL_SPEC.md §3, §9.2, §21. */
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

/** §3.1 — display order, as in the table. */
export const MATERIALS: MaterialDef[] = [
  { code: 'paper', label: 'Paper', risk: 3 },
  { code: 'fabric', label: 'Fabric', risk: 2 },
  { code: 'plastic', label: 'Plastic', risk: 3 },
  { code: 'wood', label: 'Wood', risk: 2 },
  { code: 'wire_insulation', label: 'Wire Insulation', risk: 3 },
  { code: 'other', label: 'Other', risk: 2 },
];

export const MAT: Record<MaterialType, MaterialDef> = Object.fromEntries(
  MATERIALS.map((m) => [m.code, m]),
) as Record<MaterialType, MaterialDef>;

/** §3.3 — flow presets for simple mode. */
export const FLOW_PRESETS: { code: string; label: string; value: number }[] = [
  { code: 'none', label: 'None', value: 0 },
  { code: 'weak', label: 'Weak', value: 2.5 },
  { code: 'medium', label: 'Medium', value: 10 },
  { code: 'strong', label: 'Strong', value: 20 },
];

export const GRAVITY_OPTIONS: { code: Gravity; label: string; short: string }[] = [
  { code: 'earth', label: 'Earth', short: 'Earth' },
  { code: 'microgravity', label: 'Microgravity', short: 'μg' },
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

/** §3.4 — placeholder layout (16.14). [BACKEND] GET /api/sectors. */
export const SECTORS: SectorDef[] = [
  { id: 'sh', code: 'AL', name: 'Airlock', desc: 'Docking node and exit hatch.', x: 14, y: 95, w: 80, h: 70 },
  { id: 'km', code: 'CM', name: 'Command Module', desc: 'Control and communication stations.', x: 104, y: 80, w: 120, h: 100 },
  { id: 'zh', code: 'HM', name: 'Habitation Module', desc: 'Crew quarters, galley, rest area.', x: 234, y: 60, w: 150, h: 140 },
  { id: 'l1', code: 'LB-1', name: 'Laboratory 1', desc: 'Scientific equipment and samples.', x: 394, y: 40, w: 116, h: 85 },
  { id: 'l2', code: 'LB-2', name: 'Laboratory 2', desc: 'Scientific equipment and samples.', x: 394, y: 135, w: 116, h: 85 },
  { id: 'sk', code: 'ST', name: 'Storage', desc: 'Cargo, supplies, containers.', x: 520, y: 80, w: 96, h: 100 },
  { id: 'ep', code: 'PB', name: 'Power Bay', desc: 'Power distribution, cable runs.', x: 626, y: 95, w: 80, h: 70 },
];

export const SEC: Record<SectorId, SectorDef> = Object.fromEntries(
  SECTORS.map((s) => [s.id, s]),
) as Record<SectorId, SectorDef>;

/** §3.5 — level labels. */
export const RISK_LEVEL_RU: Record<Level, string> = { low: 'Low', medium: 'Medium', high: 'High' };
export const EXT_LEVEL_RU: Record<Level, string> = { low: 'Low', medium: 'Medium', high: 'High' };
export const VERDICT_RU: Record<Level, string> = {
  low: 'Safe',
  medium: 'Needs Attention',
  high: 'Dangerous',
};
export const VERDICT_SUBTITLE: Record<Level, string> = {
  low: 'conditions do not support flame development',
  medium: 'development or unstable combustion is possible',
  high: 'high probability of rapid spread',
};

/** Short status label on the map. */
export const STATUS_WORD: Record<SectorStatus, string> = {
  none: 'no data',
  low: 'normal',
  medium: 'caution',
  high: 'danger',
};

/** Status label in the legend. */
export const STATUS_LEGEND: Record<SectorStatus, string> = {
  none: 'No data',
  low: 'Safe',
  medium: 'Caution',
  high: 'Danger',
};

/** §9.2 — numeric field ranges. */
export const RANGES: Record<NumericKey, [number, number]> = {
  thickness: [0.05, 10],
  o2: [13, 35],
  flow: [0, 30],
  temp: [20, 300],
  time: [0, 600],
};

/** Slider/arrow step (step validation is not performed — 16.22). */
export const STEPS: Record<NumericKey, number> = {
  thickness: 0.05,
  o2: 0.5,
  flow: 0.5,
  temp: 5,
  time: 1,
};

export const FIELD_NAMES: Record<FieldKey, string> = {
  sector: 'Sector',
  material: 'Material',
  thickness: 'Thickness',
  o2: 'Oxygen',
  flow: 'Air Flow',
  gravity: 'Gravity',
  temp: 'Temperature',
  time: 'Burn Time',
};

/** Field order = checklist order and the "Missing: …" enumeration. */
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
  thickness: ' mm',
  o2: ' %',
  flow: ' cm/s',
  temp: ' °C',
  time: ' s',
};

/** §9.3 — messages for the "bad" status. */
export const RANGE_ERRORS: Record<NumericKey, string> = {
  thickness: 'Allowed range: 0.05 to 10 mm',
  o2: 'Allowed range: 13 to 35 %',
  flow: 'Allowed range: 0 to 30 cm/s',
  temp: 'Allowed range: 20 to 300 °C',
  time: 'Allowed range: 0 to 600 s',
};

/** §21.1 — status dot colors. */
export const DOT: Record<SectorStatus, string> = {
  none: 'var(--color-neutral-400)',
  low: 'oklch(0.66 0.1 155)',
  medium: 'oklch(0.78 0.12 88)',
  high: 'oklch(0.5 0.17 28)',
};

/** §21.1 — sector fill / text / outline on the diagram. */
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

/** §21.2 — level indicator palettes. */
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

/** §3.6 — report transmission status. */
export const sentFull = (sent: string | null): string =>
  sent ? `Sent to Earth · ${sent}` : 'Queued for transmission';

export const sentShort = (sent: string | null): string => (sent ? 'sent' : 'queued');

export const gravityRu = (g: Gravity): string => (g === 'earth' ? 'Earth' : 'microgravity');
export const gravityShort = (g: Gravity): string => (g === 'earth' ? 'Earth' : 'μg');
