// P2A.7.6 flying into a hill triggers the crash result, live: the real bridge and SITL (needs sim/sitl-win). The foot of a
// slope below Mount Abu (24.52101, 72.74703, ground 299 m; heading 105 is flat for 150 m, then +65 m at 300 m and +283 m
// at 700 m, from Cesium terrain, 2026-10-09). Place the drone facing the slope, Enter and T to take off to 10 m, 1 for
// Loiter, hold the up arrow at constant height: the crash screen must appear with the drone at or below the real ground
// (most detailed Cesium terrain) and not deep inside it.
import { execSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cameraRest, checker, clickAt, open, settledAt } from './lib.mjs';

const { check, done } = checker();
const FOOT = [24.52101, 72.74703], HEADING = 105;
const BRIDGE = fileURLToPath(new URL('../../bridge/', import.meta.url));
const PY = `${BRIDGE}.venv/Scripts/python.exe`;
const bridge = spawn(PY, ['ws_server.py'], { cwd: BRIDGE, stdio: 'ignore' });
const { browser, page, log } = await open('?e2e=1', { viewport: { width: 1280, height: 800 } });
try {
  await settledAt(page, 40_000);
  await page.evaluate(([la, lo]) => void window.__dw.globe.flyToPlace(la, lo, 800), FOOT);
  await cameraRest(page, 25_000);
  await clickAt(page);
  await page.waitForFunction(() => /Ground elevation: [\d,.]+/.test(document.querySelector('#sel-elev')?.textContent ?? ''), null, { timeout: 30_000 });
  await page.evaluate((h) => {
    const c = window.__dw.viewer.camera;
    c.setView({ destination: c.positionWC.clone(), orientation: { heading: (h * Math.PI) / 180, pitch: c.pitch, roll: 0 } });
  }, HEADING);
  await page.click('#place-drone');
  await page.waitForFunction(() => document.querySelector('#drone-progress')?.textContent === 'Ready', null, { timeout: 120_000 });
  await page.evaluate(() => window.__dw.bridge().onState((s) => (window.__last = s)));
  const t0 = Date.now();
  while (Date.now() - t0 < 150_000) {
    const st = await page.evaluate(() => window.__last);
    if (st?.armed && st.altAgl > 8) break;
    if (!st?.armed) await page.keyboard.press('Enter');
    await page.waitForTimeout(1500);
    await page.keyboard.press('t');
    await page.locator('#pf-continue').click({ timeout: 1000 }).catch(() => {}); // pre-flight warnings (P3.3.5): one click
    await page.waitForTimeout(3000);
  }
  await page.waitForFunction(() => window.__last?.altAgl > 9, null, { timeout: 60_000 });
  await page.keyboard.press('1');
  await page.waitForFunction(() => window.__last?.mode === 'LOITER', null, { timeout: 10_000 });
  await page.evaluate(() => window.__dw.views.set('chase')); // the terrain under the drone loads in detail
  await page.keyboard.down('ArrowUp');
  const crashed = await page.waitForFunction(() => window.__dw.crash() !== null, null, { timeout: 120_000, polling: 100 }).then(() => true, () => false);
  await page.keyboard.up('ArrowUp');
  const crash = await page.evaluate(() => window.__dw.crash());
  const box = await page.evaluate(() => document.getElementById('crash-result')?.checkVisibility() ?? false);
  const fine = crash ? await page.evaluate(([la, lo]) => window.__dw.globe.groundMsl(la, lo), [crash.lat, crash.lon]) : undefined;
  const agl = crash && fine !== undefined ? crash.altMsl - fine : NaN;
  const from = crash ? 2 * 6_371_008.8 * Math.asin(Math.sqrt(Math.sin(((crash.lat - FOOT[0]) * Math.PI) / 360) ** 2 + Math.cos(FOOT[0] * Math.PI / 180) * Math.cos(crash.lat * Math.PI / 180) * Math.sin(((crash.lon - FOOT[1]) * Math.PI) / 360) ** 2)) : NaN;
  console.log(`info  crash ${JSON.stringify(crash)}; most detailed ground ${fine?.toFixed(1)} m; ${from.toFixed(0)} m from the foot`);
  check('P2A.7.6 flying at constant height into the slope shows the crash screen', crashed && box, `${from.toFixed(0)} m out, at ${crash?.groundSpeed.toFixed(1)} m/s`);
  check('P2A.7.6 at the crash the drone is at or below the real ground (AGL <= 0) and not through it (deeper than 3 m)', agl <= 0 && agl > -3, `drone ${crash?.altMsl.toFixed(1)} m MSL, most detailed ground ${fine?.toFixed(1)} m: AGL ${agl.toFixed(2)} m`);
  check('whole run: 0 console errors (apart from handled lookups)', log.errors.filter((e) => !/overpass|mapillary|WebSocket connection/.test(e)).length === 0, log.errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  bridge.kill();
  execSync(`"${PY}" -c "import sitl; sitl.stop_stale()"`, { cwd: BRIDGE });
}
done();
