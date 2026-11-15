/**
 * Smoke-test render of every screen without a browser (react-dom/server).
 * Catches hook errors and undefined accesses before running in the browser.
 * Usage: npm run smoke
 */
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import type { ReactElement } from 'react';
import { StoreProvider, type State, type Tab } from '@/state/store';
import { ConsolePage } from '@/screens/Console/ConsolePage';
import { confidenceOf, score, verdictOfScores } from '@/domain/scoring';
import { toForm } from '@/domain/validation';
import type { Analysis, AnalysisParams } from '@/domain/types';

const TABS: Tab[] = ['overview', 'map', 'analysis', 'reports', 'data', 'rules', 'models'];

const p: AnalysisParams = {
  material: 'paper',
  desc: '',
  thickness: 0.5,
  o2: 21,
  flow: 5,
  gravity: 'microgravity',
  temp: 25,
  time: 30,
};
const s = score(p);
const entry: Analysis = {
  id: 4,
  ts: '09:20:11',
  sector: 'l1',
  p,
  risk: s.risk,
  ext: s.ext,
  level: s.level,
  extLevel: s.extLevel,
  v: verdictOfScores(s),
  conf: confidenceOf(p),
  sent: null,
};

const withData: Partial<State> = {
  hist: [entry],
  activeId: entry.id,
  repId: entry.id,
  cur: 'l1',
  form: toForm(p),
};

let fails = 0;
const run = (label: string, el: ReactElement) => {
  try {
    const html = renderToString(<StaticRouter location="/">{el}</StaticRouter>);
    console.log(`OK   ${label}  (${html.length} characters)`);
  } catch (e) {
    fails++;
    console.log(`FAIL ${label}: ${(e as Error).message}`);
  }
};

for (const tab of TABS) {
  for (const seeded of [false, true]) {
    const seed: Partial<State> = { tab, ...(seeded ? withData : {}) };
    run(`${tab}${seeded ? ' + data' : ' (empty)'}`,
      <StoreProvider seed={seed}>
        <ConsolePage />
      </StoreProvider>);
  }
}

for (const view of ['alert', 'recs'] as const) {
  run(`modal: ${view}`,
    <StoreProvider seed={{ tab: 'analysis', ...withData, modal: { id: entry.id, view } }}>
      <ConsolePage />
    </StoreProvider>);
}

console.log(fails ? `\n${fails} FAILED` : '\nall screens render without errors');
if (fails) process.exit(1);
