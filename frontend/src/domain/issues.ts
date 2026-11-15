/** Open specification questions. FUNCTIONAL_SPEC.md §13, §24. [BACKEND] GET /api/issues. */
export interface Issue {
  id: string;
  title: string;
  done: boolean;
}

export const ISSUES: Issue[] = [
  { id: '16.1', title: 'Range boundaries are not defined', done: false },
  { id: '16.2', title: 'Risk and extinction are calculated independently', done: false },
  { id: '16.3', title: 'Thickness works against its own description', done: false },
  { id: '16.4', title: 'The risk scale is skewed toward "high"', done: false },
  { id: '16.5', title: 'Test dataset issues', done: false },
  { id: '16.6', title: 'The "other" material', done: false },
  { id: '16.7', title: 'Value codes for other / earth', done: true },
  { id: '16.8', title: 'Simple air flow mode', done: true },
  { id: '16.9', title: 'Explanation and recommendation rules', done: false },
  { id: '16.10', title: 'Graph and flame-class model', done: false },
  { id: '16.11', title: 'Material card texts', done: false },
  { id: '16.12', title: 'Analysis history storage', done: false },
  { id: '16.13', title: 'Unvalidated NASA ranges', done: false },
];

export const ISSUES_SUMMARY = `${ISSUES.filter((i) => !i.done).length} open · ${
  ISSUES.filter((i) => i.done).length
} resolved`;
