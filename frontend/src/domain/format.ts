/** Formatting. FUNCTIONAL_SPEC.md §0. */

/** Integer → no fractional part; fractional → up to 2 digits with no trailing zeros. */
export const f1 = (v: number): string =>
  Number.isInteger(v) ? String(v) : String(+v.toFixed(2));

/** Analysis number zero-padded to 4 digits. */
export const pad = (n: number): string => String(n).padStart(4, '0');

/** Calculation completion time — local HH:MM:SS. [BACKEND] ISO 8601. */
export const now = (): string => new Date().toTimeString().slice(0, 8);

/** Form string → number; an empty string yields NaN (not 0). */
export const pn = (s: string | null | undefined): number =>
  s === '' || s == null ? NaN : Number(s);

export const reportNo = (analysisId: number): string => `RPT-${pad(analysisId)}`;
