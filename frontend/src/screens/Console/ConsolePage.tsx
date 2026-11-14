/** Панель. Вкладки и общие элементы. FUNCTIONAL_SPEC.md §5. */
import { useEffect } from 'react';
import { Footer, Header } from '@/components/Header';
import { AlertModal } from '@/components/AlertModal';
import { useStore } from '@/state/store';
import { useFormModel } from '@/state/useForm';
import { toParams } from '@/domain/validation';
import { OverviewTab } from './OverviewTab';
import { MapTab } from './MapTab';
import { AnalysisTab } from './AnalysisTab';
import { ReportsTab } from './ReportsTab';
import { DataTab } from './DataTab';
import { RulesTab } from './RulesTab';
import { ModelsTab } from './ModelsTab';

export function ConsolePage() {
  useKeyboard();
  const { state } = useStore();

  return (
    <div className="app">
      <Header user="demo" />
      {state.tab === 'overview' ? <OverviewTab /> : null}
      {state.tab === 'map' ? <MapTab /> : null}
      {state.tab === 'analysis' ? <AnalysisTab /> : null}
      {state.tab === 'reports' ? <ReportsTab /> : null}
      {state.tab === 'data' ? <DataTab /> : null}
      {state.tab === 'rules' ? <RulesTab /> : null}
      {state.tab === 'models' ? <ModelsTab /> : null}
      <Footer />
      {state.modal ? <AlertModal /> : null}
    </div>
  );
}

/** §5.4 — Ctrl/Cmd+Enter запускает анализ, Esc закрывает модальное окно. */
function useKeyboard() {
  const { state, dispatch, runAnalysis } = useStore();
  const model = useFormModel();
  const { tab, modal, running, cur, form } = state;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modal) {
        dispatch({ type: 'modal', modal: null });
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && tab === 'analysis' && !modal) {
        e.preventDefault();
        // Повторный запуск во время расчёта игнорируется (§23).
        if (model.complete && !running && cur) runAnalysis(cur, toParams(form));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tab, modal, running, cur, form, model.complete, dispatch, runAnalysis]);
}
