/** Открытые вопросы спецификации. FUNCTIONAL_SPEC.md §13, §24. [БЭКЕНД] GET /api/issues. */
export interface Issue {
  id: string;
  title: string;
  done: boolean;
}

export const ISSUES: Issue[] = [
  { id: '16.1', title: 'Границы диапазонов не определены', done: false },
  { id: '16.2', title: 'Риск и затухание рассчитываются независимо', done: false },
  { id: '16.3', title: 'Толщина работает против собственного описания', done: false },
  { id: '16.4', title: 'Шкала риска смещена к «высокому»', done: false },
  { id: '16.5', title: 'Проблемы тестового набора данных', done: false },
  { id: '16.6', title: 'Материал «другое»', done: false },
  { id: '16.7', title: 'Коды значений other / earth', done: true },
  { id: '16.8', title: 'Простой режим потока воздуха', done: true },
  { id: '16.9', title: 'Правила объяснений и рекомендаций', done: false },
  { id: '16.10', title: 'Модель графика и класса пламени', done: false },
  { id: '16.11', title: 'Тексты карточек материалов', done: false },
  { id: '16.12', title: 'Хранение истории анализов', done: false },
  { id: '16.13', title: 'Непроверенные диапазоны NASA', done: false },
];

export const ISSUES_SUMMARY = `${ISSUES.filter((i) => !i.done).length} открыто · ${
  ISSUES.filter((i) => i.done).length
} решено`;
