/**
 * Прогон реального httpApi.ts против живого бэкенда (backend/run.py, порт 5000).
 * Запуск: npm run e2e — предварительно поднять бэкенд и создать учётку:
 *   cd ../backend && python3 seed.py && python3 run.py
 * База должна быть пустой: проверяются id 1 и 2.
 */
import { httpApi } from '@/api/httpApi';
import type { Analysis } from '@/domain/types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ok = (label: string, cond: unknown) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${label}`);
  if (!cond) process.exitCode = 1;
};

async function main() {
  await httpApi.auth.login('demo', 'xscience-demo');
  const user = await httpApi.auth.verifyCode('123456');
  ok(`вход: ${user.login}/${user.role}, сессия до ${user.expiresAt}`,
    user.login === 'demo' && /^\d\d:\d\d$/.test(user.expiresAt));

  const seen: Analysis[][] = [];
  const off = httpApi.analyses.subscribe((h) => seen.push(h));

  const a = await httpApi.analyses.create({
    sector: 'l1',
    params: { material: 'paper', desc: '', thickness: 0.5, o2: 21, flow: 5,
      gravity: 'microgravity', temp: 25, time: 30 },
  });
  ok(`анализ A: R=${a.analysis.risk} E=${a.analysis.ext} v=${a.analysis.v} ` +
     `conf=${a.analysis.conf} alert=${a.alertLevel}`,
    a.analysis.risk === 9 && a.analysis.ext === 2 && a.analysis.v === 'medium' &&
    a.analysis.conf === 62 && a.alertLevel === 'medium' && a.analysis.sent === null);
  ok('p приходит в именах прототипа', a.analysis.p.o2 === 21 && a.analysis.p.material === 'paper');

  const c = await httpApi.analyses.create({
    sector: 'zh',
    params: { material: 'fabric', desc: '', thickness: 5, o2: 14, flow: 0,
      gravity: 'earth', temp: 20, time: 5 },
  });
  ok(`анализ C: v=${c.analysis.v} alert=${c.alertLevel}`,
    c.analysis.v === 'low' && c.alertLevel === null);

  const hist = await httpApi.analyses.list();
  ok(`list по возрастанию id: [${hist.map((h) => h.id)}]`,
    hist.length === 2 && hist[0].id === 1 && hist[1].id === 2);

  // §11.4 — через 2.5 с отчёты помечаются переданными; подписка видит это
  // очередным опросом, поэтому ждём до 12 с, а не фиксированную паузу.
  const deadline = Date.now() + 12000;
  let last: Analysis[] = [];
  while (Date.now() < deadline) {
    last = seen[seen.length - 1] ?? [];
    if (last.length === 2 && last.every((h) => !!h.sent)) break;
    await sleep(500);
  }
  ok(`subscribe увидел передачу: sent=${last.map((h) => h.sent).join(',')}`,
    last.length === 2 && last.every((h) => !!h.sent));
  off();

  // §9.3/§18.9 — сервер возвращает 422, httpApi бросает ValidationError.
  try {
    await httpApi.analyses.create({
      sector: 'l1',
      params: { material: 'paper', desc: '', thickness: 0.5, o2: 99, flow: 5,
        gravity: 'microgravity', temp: 25, time: 30 },
    });
    ok('422 → ValidationError', false);
  } catch (e) {
    const v = e as { name: string; fields: Record<string, string> };
    ok(`422 → ValidationError, поле o2: ${v.fields?.o2}`,
      v.name === 'ValidationError' && !!v.fields?.o2);
  }

  // §6.1 — неверный пароль даёт AuthError, вход не выполняется.
  try {
    await httpApi.auth.login('demo', 'wrong');
    ok('401 → AuthError', false);
  } catch (e) {
    const v = e as { name: string; code: string; attemptsLeft?: number };
    ok(`401 → AuthError(${v.code}), осталось попыток ${v.attemptsLeft}`,
      v.name === 'AuthError' && v.code === 'invalid_credentials');
  }

  await httpApi.auth.logout();
  try {
    await httpApi.analyses.list();
    ok('после logout список недоступен', false);
  } catch (e) {
    ok(`после logout список недоступен: ${(e as Error).message}`,
      (e as Error).message === '401 unauthorized');
  }
}

main();
