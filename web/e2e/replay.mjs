// P3.1.2 the replay screen with a fixture log (30 s of a recorded SITL flight at Pushkar, written in the bridge logger's
// format): the slider spans the log; 2x speed ends in half the 1x time (+/-10 %); at any slider time the drawn drone is
// within 1 m of the log's position (interpolated between samples, as the screen does).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checker, open } from './lib.mjs';

const { check, done } = checker();
const FILE = fileURLToPath(new URL('./fixtures/flight-log-30s.jsonl', import.meta.url));
const samples = readFileSync(FILE, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).map((r) => ({ ms: Date.parse(r.t), s: r.state }));
const span = samples.at(-1).ms - samples[0].ms;
const R = Math.PI / 180;
const metres = (a, b) => 2 * 6_371_008.8 * Math.asin(Math.sqrt(Math.sin(((b[0] - a[0]) * R) / 2) ** 2 + Math.cos(a[0] * R) * Math.cos(b[0] * R) * Math.sin(((b[1] - a[1]) * R) / 2) ** 2));
const at = (ms) => {
  const t = samples[0].ms + ms;
  const i = samples.findIndex((x) => x.ms > t);
  if (i <= 0) return samples[i === 0 ? 0 : samples.length - 1].s;
  const a = samples[i - 1].s, b = samples[i].s, k = (t - samples[i - 1].ms) / (samples[i].ms - samples[i - 1].ms);
  return { lat: a.lat + (b.lat - a.lat) * k, lon: a.lon + (b.lon - a.lon) * k, altMsl: a.altMsl + (b.altMsl - a.altMsl) * k };
};

const { browser, page, log } = await open('?e2e=1&notoken=1&replay', { viewport: { width: 1100, height: 750 } });
try {
  await page.waitForFunction(() => window.__dw?.settled(), null, { timeout: 40_000 });
  await page.setInputFiles('#replay-file', FILE);
  await page.waitForFunction(() => document.getElementById('replay-controls').checkVisibility(), null, { timeout: 5000 });
  const max = await page.evaluate(() => Number(document.getElementById('replay-slider').max));
  check('P3.1.2 the fixture log loads and the slider spans its duration', max === span, `slider 0..${max} ms, log ${span} ms`);

  const play = async (speed) => {
    await page.selectOption('#replay-speed', String(speed));
    await page.evaluate(() => { const p = document.getElementById('replay'); delete p.dataset.ended; document.getElementById('replay-slider').value = '0'; });
    await page.click('#replay-play');
    await page.waitForFunction(() => document.getElementById('replay').dataset.ended, null, { timeout: 120_000, polling: 100 });
    return page.evaluate(() => Number(document.getElementById('replay').dataset.ended) - Number(document.getElementById('replay').dataset.started));
  };
  const one = await play(1);
  const two = await play(2);
  check('P3.1.2 at 2x speed the replay ends in half the time (+/-10 %)', Math.abs(two / one - 0.5) <= 0.05, `1x ${(one / 1000).toFixed(2)} s, 2x ${(two / 1000).toFixed(2)} s, ratio ${(two / one).toFixed(3)}`);

  let worst = 0, worstUp = 0;
  for (const f of [0.05, 0.13, 0.27, 0.33, 0.41, 0.58, 0.66, 0.74, 0.89, 0.97]) {
    const ms = Math.round(f * span);
    await page.evaluate((ms) => { const s = document.getElementById('replay-slider'); s.value = String(ms); s.dispatchEvent(new Event('input')); window.__dw.viewer.scene.requestRender(); }, ms);
    await page.waitForTimeout(400); // the drawn drone eases onto the new place (40 ms smoothing)
    const want = at(ms);
    const got = await page.evaluate((w) => ({ now: window.__dw.droneNow(), h: window.__dw.mslToEllipsoid(w.lat, w.lon, w.altMsl) }), want);
    worst = Math.max(worst, metres([want.lat, want.lon], [got.now.lat, got.now.lon]));
    worstUp = Math.max(worstUp, Math.abs(got.now.h - got.h));
  }
  check('P3.1.2 at any slider time the drone is within 1 m of the log position (10 times along the log)', worst <= 1 && worstUp <= 1, `worst ${worst.toFixed(2)} m across, ${worstUp.toFixed(2)} m in height`);
  check('whole run: 0 console errors', log.errors.length === 0, log.errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}
done();
