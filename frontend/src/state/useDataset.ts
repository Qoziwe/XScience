/**
 * Набор данных для вкладки «Данные» (§12, §19).
 * Источник — сервер (`GET /api/dataset`): там набор расширен и его состав
 * может меняться. Если раздела нет (прототип, VITE_API=local) или сервер
 * недоступен — остаётся локальный набор §19.2 из 30 строк.
 */
import { useEffect, useState } from 'react';
import { api, type DatasetRow, type DatasetSummary } from '@/api';
import { DATASET, DATASET_MISMATCHES } from '@/domain/dataset';

export interface DatasetState {
  rows: DatasetRow[];
  summary: DatasetSummary;
  /** 'server' | 'local' — что показано; local значит, что это набор прототипа. */
  origin: 'server' | 'local';
  loading: boolean;
}

/** Локальный набор §19.2 в той же форме, что приходит с сервера. */
function localRows(): DatasetRow[] {
  return DATASET.map((r) => ({
    n: r.n,
    dataset: 'v1',
    p: r.p,
    flameSizeCm: r.size,
    flameSpreadRateCmS: r.rate,
    riskLevel: r.risk,
    extinctionProbability: r.ext,
    expectedResult: r.res,
    computed: { risk: r.s.risk, level: r.s.level, ext: r.s.ext, extLevel: r.s.extLevel },
    ok: r.ok,
    dataSource: 'simulated_rule_based',
    dataSourceValid: false,
  }));
}

const LOCAL: DatasetState = {
  rows: localRows(),
  summary: {
    rows: DATASET.length,
    riskClasses: [...new Set(DATASET.map((r) => r.risk))],
    earthRows: DATASET.filter((r) => r.p.gravity === 'earth').length,
    validDataSource: 0,
    mismatches: DATASET_MISMATCHES,
  },
  origin: 'local',
  loading: false,
};

export function useDataset(): DatasetState {
  const [state, setState] = useState<DatasetState>(() =>
    api.dataset ? { ...LOCAL, loading: true } : LOCAL,
  );

  useEffect(() => {
    const source = api.dataset;
    if (!source) return;
    let alive = true;
    source
      .load()
      .then(({ summary, rows }) => {
        if (alive) setState({ rows, summary, origin: 'server', loading: false });
      })
      .catch(() => {
        // Сервер недоступен — показываем локальный набор, не пустую таблицу.
        if (alive) setState(LOCAL);
      });
    return () => {
      alive = false;
    };
  }, []);

  return state;
}
