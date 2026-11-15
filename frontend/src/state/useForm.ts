/** Derived values for the "Analysis" form. FUNCTIONAL_SPEC.md §9.1–9.4. */
import { useMemo } from 'react';
import { FIELD_NAMES, FIELD_ORDER } from '@/domain/reference';
import { pn } from '@/domain/format';
import { score } from '@/domain/scoring';
import {
  hasBad,
  isComplete,
  missingKeys,
  statuses,
  toParams,
  warningsOf,
  type FieldStatuses,
  type FormState,
  type Warnings,
} from '@/domain/validation';
import type { PartialScores, SectorId } from '@/domain/types';
import { useStore } from './store';

/** Partial scores for the filled fields; null for fields not in "ok" status. */
export type LiveScores = Record<keyof PartialScores, number | null>;

export interface FormModel {
  form: FormState;
  status: FieldStatuses;
  complete: boolean;
  anyBad: boolean;
  filledCount: number;
  /** Names of unfilled fields in lowercase, in §9.2 order. */
  missing: string[];
  live: LiveScores;
  warnings: Warnings;
  /** Total sums for the "Rules" tab: only when the form is fully complete. */
  totals: { risk: string; ext: string };
}

export function useFormModel(): FormModel {
  const { state } = useStore();
  const { form, cur } = state;

  return useMemo(() => {
    const status = statuses(form, cur);
    const complete = isComplete(status);
    const filledCount = FIELD_ORDER.filter((k) => status[k] === 'ok').length;

    // §9.2: contributions are only computed for fields in "ok" status — the
    // other fields' values are not substituted, hence the placeholders zeroed below.
    const t = score({
      material: form.material ?? 'other',
      desc: '',
      thickness: status.thickness === 'ok' ? pn(form.thickness) : 1,
      o2: status.o2 === 'ok' ? pn(form.o2) : 21,
      flow: status.flow === 'ok' ? pn(form.flow) : 1,
      temp: status.temp === 'ok' ? pn(form.temp) : 20,
      time: status.time === 'ok' ? pn(form.time) : 0,
      gravity: form.gravity ?? 'earth',
    }).t;

    const live: LiveScores = {
      mat: status.material === 'ok' ? t.mat : null,
      th: status.thickness === 'ok' ? t.th : null,
      o2: status.o2 === 'ok' ? t.o2 : null,
      od: status.o2 === 'ok' ? t.od : null,
      flow: status.flow === 'ok' ? t.flow : null,
      lf: status.flow === 'ok' ? t.lf : null,
      temp: status.temp === 'ok' ? t.temp : null,
      time: status.time === 'ok' ? t.time : null,
      grav: status.gravity === 'ok' ? t.grav : null,
    };

    const totals = complete
      ? (() => {
          const s = score(toParams(form));
          return { risk: String(s.risk), ext: String(s.ext) };
        })()
      : { risk: '—', ext: '—' };

    return {
      form,
      status,
      complete,
      anyBad: hasBad(status),
      filledCount,
      missing: missingKeys(status).map((k) => FIELD_NAMES[k].toLowerCase()),
      live,
      warnings: warningsOf(form, status),
      totals,
    };
  }, [form, cur]);
}

/** Sector locked in for running the calculation. */
export const fixedSector = (cur: SectorId | null): SectorId => cur as SectorId;
