/**
 * Состояние вкладки «Модели» (§17.1–17.2).
 * Готовность, обучение и прогноз живут на сервере; без раздела `models`
 * (прототип, VITE_API=local) хук отдаёт `available: false`, и экран
 * показывает то же, что прототип — проверки по локальному набору.
 */
import { useCallback, useEffect, useState } from 'react';
import { api, NotConfiguredError, type Prediction, type Readiness } from '@/api';
import type { AnalysisParams } from '@/domain/types';

export interface ModelsState {
  available: boolean;
  readiness: Readiness | null;
  loading: boolean;
  error: string;
  training: boolean;
  trainNote: string;
  prediction: Prediction | null;
  predictError: string;
}

const EMPTY: ModelsState = {
  available: false,
  readiness: null,
  loading: false,
  error: '',
  training: false,
  trainNote: '',
  prediction: null,
  predictError: '',
};

export function useModels(params: AnalysisParams | null) {
  const source = api.models;
  const [state, setState] = useState<ModelsState>(() =>
    source ? { ...EMPTY, available: true, loading: true } : EMPTY,
  );

  const refresh = useCallback(async () => {
    if (!source) return;
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const readiness = await source.readiness();
      setState((s) => ({ ...s, readiness, loading: false }));
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: message(e) }));
    }
  }, [source]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const train = useCallback(async () => {
    if (!source) return;
    setState((s) => ({ ...s, training: true, trainNote: '', error: '' }));
    try {
      const res = await source.train();
      setState((s) => ({ ...s, training: false, trainNote: res.note }));
      await refresh();
    } catch (e) {
      setState((s) => ({ ...s, training: false, error: message(e) }));
    }
  }, [source, refresh]);

  // Прогноз обновляется, когда модель обучена и форма анализа заполнена целиком.
  const trained = !!state.readiness?.model.trained;
  const key = params ? JSON.stringify(params) : '';
  useEffect(() => {
    if (!source || !trained || !params) {
      setState((s) => (s.prediction || s.predictError
        ? { ...s, prediction: null, predictError: '' }
        : s));
      return;
    }
    let alive = true;
    source
      .predict(params)
      .then((prediction) => alive && setState((s) => ({ ...s, prediction, predictError: '' })))
      .catch((e) => alive && setState((s) => ({ ...s, prediction: null, predictError: message(e) })));
    return () => {
      alive = false;
    };
    // params сравниваем по значению: объект пересоздаётся на каждый рендер.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, trained, key]);

  return { ...state, refresh, train };
}

function message(e: unknown): string {
  if (e instanceof NotConfiguredError) return e.detail || e.code;
  return e instanceof Error ? e.message : String(e);
}
