/**
 * Runs the real httpApi.ts against a live backend (backend/run.py, port 5000).
 * Usage: npm run e2e — first start the backend and create an account:
 *   cd ../backend && python3 seed.py && python3 run.py
 * The database must be empty: ids 1 and 2 are checked.
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
  ok(`login: ${user.login}/${user.role}, session until ${user.expiresAt}`,
    user.login === 'demo' && /^\d\d:\d\d$/.test(user.expiresAt));

  const seen: Analysis[][] = [];
  const off = httpApi.analyses.subscribe((h) => seen.push(h));

  const a = await httpApi.analyses.create({
    sector: 'l1',
    params: { material: 'paper', desc: '', thickness: 0.5, o2: 21, flow: 5,
      gravity: 'microgravity', temp: 25, time: 30 },
  });
  ok(`analysis A: R=${a.analysis.risk} E=${a.analysis.ext} v=${a.analysis.v} ` +
     `conf=${a.analysis.conf} alert=${a.alertLevel}`,
    a.analysis.risk === 9 && a.analysis.ext === 2 && a.analysis.v === 'medium' &&
    a.analysis.conf === 62 && a.alertLevel === 'medium' && a.analysis.sent === null);
  ok('p comes back in prototype field names', a.analysis.p.o2 === 21 && a.analysis.p.material === 'paper');

  const c = await httpApi.analyses.create({
    sector: 'zh',
    params: { material: 'fabric', desc: '', thickness: 5, o2: 14, flow: 0,
      gravity: 'earth', temp: 20, time: 5 },
  });
  ok(`analysis C: v=${c.analysis.v} alert=${c.alertLevel}`,
    c.analysis.v === 'low' && c.alertLevel === null);

  const hist = await httpApi.analyses.list();
  ok(`list in ascending id order: [${hist.map((h) => h.id)}]`,
    hist.length === 2 && hist[0].id === 1 && hist[1].id === 2);

  // §11.4 — after 2.5 s reports are marked sent; the subscription sees this on
  // its next poll, so we wait up to 12 s rather than a fixed pause.
  const deadline = Date.now() + 12000;
  let last: Analysis[] = [];
  while (Date.now() < deadline) {
    last = seen[seen.length - 1] ?? [];
    if (last.length === 2 && last.every((h) => !!h.sent)) break;
    await sleep(500);
  }
  ok(`subscribe saw the transmission: sent=${last.map((h) => h.sent).join(',')}`,
    last.length === 2 && last.every((h) => !!h.sent));
  off();

  // §9.3/§18.9 — the server returns 422, httpApi throws ValidationError.
  try {
    await httpApi.analyses.create({
      sector: 'l1',
      params: { material: 'paper', desc: '', thickness: 0.5, o2: 99, flow: 5,
        gravity: 'microgravity', temp: 25, time: 30 },
    });
    ok('422 → ValidationError', false);
  } catch (e) {
    const v = e as { name: string; fields: Record<string, string> };
    ok(`422 → ValidationError, field o2: ${v.fields?.o2}`,
      v.name === 'ValidationError' && !!v.fields?.o2);
  }

  // §6.1 — a wrong password raises AuthError, login does not proceed.
  try {
    await httpApi.auth.login('demo', 'wrong');
    ok('401 → AuthError', false);
  } catch (e) {
    const v = e as { name: string; code: string; attemptsLeft?: number };
    ok(`401 → AuthError(${v.code}), attempts left ${v.attemptsLeft}`,
      v.name === 'AuthError' && v.code === 'invalid_credentials');
  }

  // §6.5 — me() guards the /console route.
  const session = await httpApi.auth.me();
  ok(`me(): ${session?.login}/${session?.role}, until ${session?.expiresAt}`,
    session?.login === 'demo' && /^\d\d:\d\d$/.test(session?.expiresAt ?? ''));

  // §10.2 — "Acknowledged" in the alert window.
  await httpApi.analyses.ack(1);
  const acked = (await httpApi.analyses.list()).find((h) => h.id === 1);
  ok('ack(1) is marked on the record', acked?.acked === true);

  // §18.5 — dataset for the "Data" tab.
  const ds = await httpApi.dataset!.load();
  ok(`dataset: ${ds.summary.rows} rows, risk_level classes ` +
     `${ds.summary.riskClasses.length}, mismatches ${ds.summary.mismatches}`,
    ds.rows.length === ds.summary.rows && ds.summary.riskClasses.length === 3 &&
    ds.summary.mismatches === 1);
  ok('row 13 is flagged as a mismatch with the formulas',
    ds.rows.find((r) => r.n === 13)?.ok === false);

  // §17.1 — readiness, training, prediction.
  const before = await httpApi.models!.readiness();
  ok(`readiness: ${before.checks.length} checks, can train ` +
     `${before.trainingSet.canTrain}, model ${before.model.trained}`,
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
  ok('predict without a trained model → NotConfiguredError', predictBlocked || before.model.trained);

  const trained = await httpApi.models!.train();
  const acc = trained.metrics.targets.risk_level;
  ok(`train(): ${trained.version}, rows ${trained.metrics.rows}, ` +
     `risk accuracy ${acc.trainAccuracy}/${acc.testAccuracy}`,
    acc.testAccuracy > 0.5 && trained.metrics.rows > 50);

  const after = await httpApi.models!.readiness();
  ok(`model trained: ${after.model.version}`, after.model.trained);

  const pred = await httpApi.models!.predict({
    material: 'paper', desc: '', thickness: 0.1, o2: 30, flow: 20,
    gravity: 'microgravity', temp: 250, time: 300,
  });
  ok(`predict(): risk ${pred.predictions.risk_level.label}, extinction ` +
     `${pred.predictions.extinction_probability.label}`,
    pred.predictions.risk_level.label === 'high');

  // §17.2 — the d² law that the "Models" tab checks its chart against.
  const d2 = await httpApi.models!.d2(2, 0.5);
  ok(`d2(2, 0.5): t_burn ${d2.tBurnS} s, points ${d2.points.length}`,
    d2.tBurnS === 8 && d2.points.length === 41);

  // §17.3 — flame photos: upload, annotation, recognition.
  const photo = await httpApi.photos!.upload(pngFile(), 1);
  ok(`upload(): ${photo.fileName}, ${photo.sizeBytes} B, analysis ${photo.analysisId}`,
    photo.mime === 'image/png' && photo.analysisId === 1 && !!photo.id);

  const annotated = await httpApi.photos!.annotate(photo.id, { size: 'large' });
  ok(`annotate(): ${JSON.stringify(annotated.annotation)}`,
    annotated.annotation.size === 'large');

  let recognised: Photo | null = null;
  let visionOff = false;
  try {
    recognised = await httpApi.photos!.recognize(photo.id);
  } catch (e) {
    visionOff = e instanceof NotConfiguredError;
  }
  ok(recognised
    ? `recognize(): ${recognised.recognition?.size}/${recognised.recognition?.brightness}` +
      `/${recognised.recognition?.shape} by model ${recognised.recognition?.model}; ` +
      `operator annotation preserved: ${recognised.annotation.size}`
    : 'recognize(): recognition is not configured → NotConfiguredError',
    recognised ? !!recognised.recognition && recognised.annotation.size === 'large' : visionOff);

  await httpApi.photos!.remove(photo.id);
  ok('remove(): photo removed', true);

  await httpApi.auth.logout();
  try {
    await httpApi.analyses.list();
    ok('list is unavailable after logout', false);
  } catch (e) {
    ok(`list is unavailable after logout: ${(e as Error).message}`,
      (e as Error).message === '401 unauthorized');
  }
  const gone = await httpApi.auth.me();
  ok('me() after logout: null', gone === null);
}

/** A minimal valid PNG — the server checks the file signature, not the header. */
function pngFile(): File {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAGfOP8AAAAFUlEQVR4nGP8z8DAwMDAwMDAwAAAFAAC' +
      'AAEAAAAASUVORK5CYII=',
    'base64',
  );
  return new File([png], 'flame.png', { type: 'image/png' });
}

main();
