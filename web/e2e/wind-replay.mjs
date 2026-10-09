// P3.5.3 "the replay shows it": the calm and the 5 m/s wind flights of the golden mission (bridge/tests/golden.py
// --out) loaded into the replay screen (?replay); the slider is stepped through each flight and the drawn drone's
// distance from the planned route is measured on screen. Also reads both summaries for the cross-track and time rule.
//   CALM=sim/run-test/golden-2.jsonl WIND=sim/run-test/golden-wind.jsonl node e2e/wind-replay.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checker, open, settledAt } from './lib.mjs';

const { check, done } = checker();
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CALM = ROOT + (process.env.CALM ?? 'sim/run-test/golden-2.jsonl');
const WIND = ROOT + (process.env.WIND ?? 'sim/run-test/golden-wind.jsonl');
const HOME = [26.4897, 74.5511];
const R = Math.PI / 180;
// the golden mission (bridge/tests/golden.py MISSION): metres north, east of the test home
const ROUTE = [[0, 0], [40, 0], [40, 50], [0, 60], [-40, 30], [-30, -20]];
const ne = (lat, lon) => [(lat - HOME[0]) * 111_195, (lon - HOME[1]) * 111_195 * Math.cos(HOME[0] * R)];
const crossTrack = ([n, e]) => Math.min(...ROUTE.slice(1).map((b, i) => {
  const a = ROUTE[i], dn = b[0] - a[0], de = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((n - a[0]) * dn + (e - a[1]) * de) / (dn * dn + de * de)));
  return Math.hypot(n - a[0] - t * dn, e - a[1] - t * de);
}));
const { browser, page, log } = await open('?e2e=1&notoken=1&replay', { viewport: { width: 1100, height: 750 } });
async function replayed(file) {
  await page.setInputFiles('#replay-file', file);
  await page.waitForSelector('#replay-controls:not(.hidden)');
  const max = Number(await page.locator('#replay-slider').getAttribute('max'));
  let worst = 0;
  for (let i = 0; i <= 60; i++) {
    await page.locator('#replay-slider').evaluate((s, v) => { s.value = String(v); s.dispatchEvent(new Event('input')); }, Math.round((max * i) / 60));
    await page.waitForTimeout(60);
    const p = await page.evaluate(() => window.__dw.droneNow());
    worst = Math.max(worst, crossTrack(ne(p.lat, p.lon)));
  }
  return { seconds: max / 1000, worst };
}
try {
  await settledAt(page, 60_000);
  const calm = await replayed(CALM);
  const wind = await replayed(WIND);
  const fromLog = (f) => Math.max(...readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l).state).map((s) => crossTrack(ne(s.lat, s.lon))));
  const logs = { calm: fromLog(CALM), wind: fromLog(WIND) };
  console.log(`info  replay calm: ${calm.seconds.toFixed(1)} s, drawn max cross-track ${calm.worst.toFixed(2)} m (log ${logs.calm.toFixed(2)}); wind: ${wind.seconds.toFixed(1)} s, drawn ${wind.worst.toFixed(2)} m (log ${logs.wind.toFixed(2)})`);
  const dTime = Math.abs(wind.seconds - calm.seconds) / calm.seconds;
  check('P3.5.3 the replay shows it: wind deviation larger by > 1 m or flight time different by > 5 %', wind.worst - calm.worst > 1 || dTime > 0.05, `drawn cross-track ${calm.worst.toFixed(2)} vs ${wind.worst.toFixed(2)} m; time ${calm.seconds.toFixed(1)} vs ${wind.seconds.toFixed(1)} s (${(dTime * 100).toFixed(1)} %)`);
  check('the replay draws the logged path (drawn and logged worst cross-track within 1 m)', Math.abs(calm.worst - logs.calm) < 1 && Math.abs(wind.worst - logs.wind) < 1);
  check('whole run: 0 console errors', log.errors.length === 0, log.errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}
done();
