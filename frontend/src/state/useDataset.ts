/**
 * Dataset for the "Data" tab (§12, §19).
 * Source: the server (`GET /api/dataset`) — there the dataset is extended and its
 * composition can change. If the section is absent (prototype, VITE_API=local) or the
 * server is unavailable, it falls back to the local §19.2 set of 30 rows.
 */
import { useEffect, useState } from 'react';
import { api, type DatasetRow, type DatasetSummary } from '@/api';
import { DATASET, DATASET_MISMATCHES } from '@/domain/dataset';

export interface DatasetState {
  rows: DatasetRow[];
  summary: DatasetSummary;
  /** 'server' | 'local' — what is shown; local means it's the prototype's dataset. */
  origin: 'server' | 'local';
  loading: boolean;
}

/** The local §19.2 set in the same shape as what comes from the server. */
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
        // Server unavailable — show the local dataset, not an empty table.
        if (alive) setState(LOCAL);
      });
    return () => {
      alive = false;
    };
  }, []);

  return state;
}
