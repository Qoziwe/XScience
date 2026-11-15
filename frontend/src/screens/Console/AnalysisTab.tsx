/** "Analysis" tab: three columns. FUNCTIONAL_SPEC.md §9. */
import { AnalysisForm } from './AnalysisForm';
import { AnalysisResult } from './AnalysisResult';
import { AnalysisSide } from './AnalysisSide';

export function AnalysisTab() {
  return (
    <main className="main">
      <AnalysisForm />
      <div className="col col--main">
        <AnalysisResult />
      </div>
      <div className="col col--side">
        <AnalysisSide />
      </div>
    </main>
  );
}
