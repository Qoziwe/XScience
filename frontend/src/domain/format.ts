/** Форматирование. FUNCTIONAL_SPEC.md §0. */

/** Целое → без дробной части; дробное → до 2 знаков без лишних нулей. */
export const f1 = (v: number): string =>
  Number.isInteger(v) ? String(v) : String(+v.toFixed(2));

/** Номер анализа с дополнением нулями до 4 знаков. */
export const pad = (n: number): string => String(n).padStart(4, '0');

/** Время завершения расчёта — HH:MM:SS локального времени. [БЭКЕНД] ISO 8601. */
export const now = (): string => new Date().toTimeString().slice(0, 8);

/** Строка формы → число; пустая строка даёт NaN (а не 0). */
export const pn = (s: string | null | undefined): number =>
  s === '' || s == null ? NaN : Number(s);

export const reportNo = (analysisId: number): string => `RPT-${pad(analysisId)}`;
