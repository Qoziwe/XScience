/**
 * Общее состояние клиента. FUNCTIONAL_SPEC.md §5.3.
 * История анализов приходит из api (сейчас localApi), остальное — состояние интерфейса.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';
import { api } from '@/api';
import type { SensorsStatus } from '@/api/types';
import type { Analysis, Level, MaterialType, SectorId } from '@/domain/types';
import { EMPTY_FORM, toForm, type FormState } from '@/domain/validation';
import type { Palette } from '@/domain/reference';

export type Tab = 'overview' | 'map' | 'analysis' | 'reports' | 'data' | 'rules' | 'models';
export type ModalView = 'alert' | 'recs';

export interface ModalState {
  id: number;
  view: ModalView;
}

/** Настройки отображения (§20). Не влияют на расчёт. */
export interface Tweaks {
  showContrib: boolean;
  palette: Palette;
}

export interface Photo {
  /** Есть, когда снимок сохранён на сервере (§18.7); иначе — объект в памяти. */
  id?: string;
  url: string;
  name: string;
  size: string;
}

export interface Annotation {
  size: string;
  bright: string;
  shape: string;
}

export interface State {
  tab: Tab;
  /** Текущий сектор, общий для Обзора, Карты и Анализа. */
  cur: SectorId | null;
  form: FormState;
  hist: Analysis[];
  /** Анализ, результат которого показан на вкладке «Анализ». */
  activeId: number | null;
  /** Выбранный отчёт; null → последний. */
  repId: number | null;
  modal: ModalState | null;
  running: boolean;
  tweaks: Tweaks;
  /** Вкладка «Данные». */
  dsMat: MaterialType | 'all';
  dsMismatchOnly: boolean;
  /** Вкладка «Модели», Stage 3. */
  d0: string;
  k: string;
  photo: Photo | null;
  annotation: Annotation;
  /** История уже загружена: после этого activeId сам не восстанавливается. */
  histLoaded: boolean;
  /** [ПРОТОТИП] имитация датчиков — тумблеры в хедере и форме анализа. */
  sensors: SensorsStatus;
}

type Action =
  | { type: 'tab'; tab: Tab }
  | { type: 'pickSector'; sector: SectorId | null }
  | { type: 'patchForm'; patch: Partial<FormState> }
  | { type: 'resetForm' }
  | { type: 'loadForm'; form: FormState }
  | { type: 'hist'; hist: Analysis[] }
  | { type: 'running'; running: boolean }
  | { type: 'openAnalysis'; entry: Analysis }
  | { type: 'analysisDone'; analysis: Analysis; alertLevel: Level | null }
  | { type: 'modal'; modal: ModalState | null }
  | { type: 'modalView'; view: ModalView }
  | { type: 'repId'; id: number }
  | { type: 'tweaks'; patch: Partial<Tweaks> }
  | { type: 'dsMat'; mat: MaterialType | 'all' }
  | { type: 'toggleMismatch' }
  | { type: 'd2'; patch: { d0?: string; k?: string } }
  | { type: 'photo'; photo: Photo | null }
  | { type: 'annotation'; key: keyof Annotation; value: string }
  | { type: 'sensors'; sensors: SensorsStatus };

export const initialState: State = {
  tab: 'overview',
  cur: null,
  form: { ...EMPTY_FORM },
  hist: [],
  activeId: null,
  repId: null,
  modal: null,
  running: false,
  tweaks: { showContrib: true, palette: 'signal' },
  dsMat: 'all',
  dsMismatchOnly: false,
  d0: '',
  k: '',
  photo: null,
  annotation: { size: '', bright: '', shape: '' },
  histLoaded: false,
  sensors: { enabled: false, manualOverride: false },
};

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'tab':
      return { ...s, tab: a.tab };
    case 'pickSector':
      return { ...s, cur: a.sector };
    case 'patchForm':
      return { ...s, form: { ...s.form, ...a.patch } };
    // §9.1 «Очистить»: форма пуста, результат скрыт, сектор и история сохранены.
    case 'resetForm':
      return { ...s, form: { ...EMPTY_FORM }, activeId: null };
    case 'loadForm':
      return { ...s, form: a.form };
    case 'hist': {
      // Только при первой загрузке активным становится последний анализ истории (§9.6).
      // Дальше фоновые обновления (смена статуса передачи отчёта) activeId не меняют —
      // иначе после «Очистить» результат возвращался бы сам.
      if (s.histLoaded) return { ...s, hist: a.hist };
      return {
        ...s,
        hist: a.hist,
        histLoaded: true,
        activeId: a.hist.length ? a.hist[a.hist.length - 1].id : null,
      };
    }
    case 'running':
      return { ...s, running: a.running };
    // §5.3 — открытие анализа ставит activeId, cur и копирует параметры в форму.
    case 'openAnalysis':
      return {
        ...s,
        tab: 'analysis',
        activeId: a.entry.id,
        cur: a.entry.sector,
        form: toForm(a.entry.p),
      };
    case 'analysisDone':
      return {
        ...s,
        activeId: a.analysis.id,
        repId: a.analysis.id,
        running: false,
        modal: a.alertLevel ? { id: a.analysis.id, view: 'alert' } : s.modal,
      };
    case 'modal':
      return { ...s, modal: a.modal };
    case 'modalView':
      return { ...s, modal: s.modal ? { ...s.modal, view: a.view } : null };
    case 'repId':
      return { ...s, repId: a.id };
    case 'tweaks':
      return { ...s, tweaks: { ...s.tweaks, ...a.patch } };
    case 'dsMat':
      return { ...s, dsMat: a.mat };
    case 'toggleMismatch':
      return { ...s, dsMismatchOnly: !s.dsMismatchOnly };
    case 'd2':
      return { ...s, ...a.patch };
    case 'photo':
      return { ...s, photo: a.photo, annotation: { size: '', bright: '', shape: '' } };
    case 'annotation':
      return {
        ...s,
        annotation: {
          ...s.annotation,
          // Повторное нажатие снимает выбор (§17.3).
          [a.key]: s.annotation[a.key] === a.value ? '' : a.value,
        },
      };
    case 'sensors':
      return { ...s, sensors: a.sensors };
  }
}

interface Store {
  state: State;
  dispatch: React.Dispatch<Action>;
  /** §9.5 — запуск расчёта. Повторный запуск во время расчёта игнорируется. */
  runAnalysis: (sector: SectorId, params: Parameters<typeof api.analyses.create>[0]['params']) => void;
  /** [ПРОТОТИП] включить/выключить имитацию датчиков. Нет при VITE_API=local. */
  toggleSensors: (enabled: boolean) => void;
  /** [ПРОТОТИП] разблокировать форму ручного ввода, пока датчики включены. */
  setManualOverride: (enabled: boolean) => void;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({
  children,
  seed,
}: {
  children: ReactNode;
  /** Начальное состояние для тестов и смоук-прогона. В приложении не используется. */
  seed?: Partial<State>;
}) {
  const [state, dispatch] = useReducer(reducer, { ...initialState, ...seed });

  useEffect(() => {
    let alive = true;
    api.analyses.list().then((hist) => {
      if (alive) dispatch({ type: 'hist', hist });
    });
    const off = api.analyses.subscribe((hist) => dispatch({ type: 'hist', hist }));
    return () => {
      alive = false;
      off();
    };
  }, []);

  useEffect(() => {
    if (!api.sensors) return undefined;
    let alive = true;
    api.sensors.status().then((sensors) => {
      if (alive) dispatch({ type: 'sensors', sensors });
    });
    const off = api.sensors.subscribe((sensors) => dispatch({ type: 'sensors', sensors }));
    return () => {
      alive = false;
      off();
    };
  }, []);

  const runAnalysis = useCallback<Store['runAnalysis']>(
    (sector, params) => {
      dispatch({ type: 'running', running: true });
      api.analyses
        .create({ sector, params })
        .then(({ analysis, alertLevel }) =>
          dispatch({ type: 'analysisDone', analysis, alertLevel }),
        )
        .catch(() => dispatch({ type: 'running', running: false }));
    },
    [],
  );

  const toggleSensors = useCallback<Store['toggleSensors']>((enabled) => {
    api.sensors?.setEnabled(enabled).then((sensors) => dispatch({ type: 'sensors', sensors }));
  }, []);

  const setManualOverride = useCallback<Store['setManualOverride']>((enabled) => {
    api.sensors
      ?.setManualOverride(enabled)
      .then((sensors) => dispatch({ type: 'sensors', sensors }));
  }, []);

  const value = useMemo(
    () => ({ state, dispatch, runAnalysis, toggleSensors, setManualOverride }),
    [state, runAnalysis, toggleSensors, setManualOverride],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore: нет StoreProvider выше в дереве');
  return ctx;
}
