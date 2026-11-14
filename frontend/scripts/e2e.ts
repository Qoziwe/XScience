/**
 * Прогон реального httpApi.ts против живого бэкенда (backend/run.py, порт 5000).
 * Запуск: npm run e2e — предварительно поднять бэкенд и создать учётку:
 *   cd ../backend && python3 seed.py && python3 run.py
 * База должна быть пустой: проверяются id 1 и 2.
 */
import { httpApi } from '@/api/httpApi';
import { NotConfiguredError, type Photo } from '@/api/types';
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

  // §6.5 — me() защищает маршрут /console.
  const session = await httpApi.auth.me();
  ok(`me(): ${session?.login}/${session?.role}, до ${session?.expiresAt}`,
    session?.login === 'demo' && /^\d\d:\d\d$/.test(session?.expiresAt ?? ''));

  // §10.2 — «Принято» в окне оповещения.
  await httpApi.analyses.ack(1);
  const acked = (await httpApi.analyses.list()).find((h) => h.id === 1);
  ok('ack(1) отмечен в записи', acked?.acked === true);

  // §18.5 — набор данных для вкладки «Данные».
  const ds = await httpApi.dataset!.load();
  ok(`dataset: ${ds.summary.rows} строк, классов risk_level ` +
     `${ds.summary.riskClasses.length}, расхождений ${ds.summary.mismatches}`,
    ds.rows.length === ds.summary.rows && ds.summary.riskClasses.length === 3 &&
    ds.summary.mismatches === 1);
  ok('строка 13 помечена расхождением с формулами',
    ds.rows.find((r) => r.n === 13)?.ok === false);

  // §17.1 — готовность, обучение, прогноз.
  const before = await httpApi.models!.readiness();
  ok(`readiness: ${before.checks.length} проверки, обучать можно ` +
     `${before.trainingSet.canTrain}, модель ${before.model.trained}`,
    before.checks.length === 4 && before.trainingSet.canTrain &&
    before.trainingSet.labelsAreRuleDerived);

  let predictBlocked = false;
  try {
    await httpApi.models!.predict({
      material: 'paper', desc: '', thickness: 0.5, o2: 21, flow: 5,
      gravity: 'microgravity', temp: 25, time: 30,
    });
  } catch (e) {
    predictBlocked = e instanceof NotConfiguredError;
  }
  ok('прогноз без обученной модели → NotConfiguredError', predictBlocked || before.model.trained);

  const trained = await httpApi.models!.train();
  const acc = trained.metrics.targets.risk_level;
  ok(`train(): ${trained.version}, строк ${trained.metrics.rows}, ` +
     `точность риска ${acc.trainAccuracy}/${acc.testAccuracy}`,
    acc.testAccuracy > 0.5 && trained.metrics.rows > 50);

  const after = await httpApi.models!.readiness();
  ok(`модель обучена: ${after.model.version}`, after.model.trained);

  const pred = await httpApi.models!.predict({
    material: 'paper', desc: '', thickness: 0.1, o2: 30, flow: 20,
    gravity: 'microgravity', temp: 250, time: 300,
  });
  ok(`predict(): риск ${pred.predictions.risk_level.label}, затухание ` +
     `${pred.predictions.extinction_probability.label}`,
    pred.predictions.risk_level.label === 'high');

  // §17.2 — закон d², которым вкладка «Модели» сверяет свой график.
  const d2 = await httpApi.models!.d2(2, 0.5);
  ok(`d2(2, 0.5): t_burn ${d2.tBurnS} с, точек ${d2.points.length}`,
    d2.tBurnS === 8 && d2.points.length === 41);

  // §17.3 — фото пламени: загрузка, разметка, распознавание.
  const photo = await httpApi.photos!.upload(pngFile(), 1);
  ok(`upload(): ${photo.fileName}, ${photo.sizeBytes} Б, анализ ${photo.analysisId}`,
    photo.mime === 'image/png' && photo.analysisId === 1 && !!photo.id);

  const annotated = await httpApi.photos!.annotate(photo.id, { size: 'большое' });
  ok(`annotate(): ${JSON.stringify(annotated.annotation)}`,
    annotated.annotation.size === 'большое');

  let recognised: Photo | null = null;
  let visionOff = false;
  try {
    recognised = await httpApi.photos!.recognize(photo.id);
  } catch (e) {
    visionOff = e instanceof NotConfiguredError;
  }
  ok(recognised
    ? `recognize(): ${recognised.recognition?.size}/${recognised.recognition?.brightness}` +
      `/${recognised.recognition?.shape} моделью ${recognised.recognition?.model}; ` +
      `разметка оператора сохранена: ${recognised.annotation.size}`
    : 'recognize(): распознавание не настроено → NotConfiguredError',
    recognised ? !!recognised.recognition && recognised.annotation.size === 'большое' : visionOff);

  await httpApi.photos!.remove(photo.id);
  ok('remove(): снимок удалён', true);

  await httpApi.auth.logout();
  try {
    await httpApi.analyses.list();
    ok('после logout список недоступен', false);
  } catch (e) {
    ok(`после logout список недоступен: ${(e as Error).message}`,
      (e as Error).message === '401 unauthorized');
  }
  const gone = await httpApi.auth.me();
  ok('me() после logout: null', gone === null);
}

/** Минимальный валидный PNG — сервер проверяет подпись файла, а не заголовок. */
function pngFile(): File {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAGfOP8AAAAFUlEQVR4nGP8z8DAwMDAwMDAwAAAFAAC' +
      'AAEAAAAASUVORK5CYII=',
    'base64',
  );
  return new File([png], 'flame.png', { type: 'image/png' });
}

main();
