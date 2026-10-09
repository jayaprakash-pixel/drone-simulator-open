// P3.5.2 five-waypoint mission planned, checked and flown automatically (test bridge 8001 and test simulator; needs
// sim/sitl-win and terrain). Pushkar: place the drone, Plan on, 5 clicks on the ground around home, every height set
// to 70 m above home (clear of the 50 m margin), Check terrain passes, Upload and fly: all 5 reached within 5 m.
import { execSync, spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cameraRest, checker, clickAt, open, settledAt } from './lib.mjs';

const { check, done } = checker();
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const BRIDGE = `${ROOT}bridge/`;
const PY = `${BRIDGE}.venv/Scripts/python.exe`;
const BLOG = `${ROOT}sim/run-test/bridge-mission5.log`;
const HOME = [26.4897, 74.5511];
const R = Math.PI / 180;
const metres = (a, b) => 2 * 6_371_008.8 * Math.asin(Math.sqrt(Math.sin(((b[0] - a[0]) * R) / 2) ** 2 + Math.cos(a[0] * R) * Math.cos(b[0] * R) * Math.sin(((b[1] - a[1]) * R) / 2) ** 2));
const bridge = spawn(PY, ['-u', 'ws_server.py'], { cwd: BRIDGE, stdio: ['ignore', openSync(BLOG, 'w'), openSync(BLOG, 'a')] });
const { browser, page, log } = await open('?e2e=1', { viewport: { width: 1280, height: 800 } });
try {
  await settledAt(page, 90_000);
  await page.selectOption('#quality', '0.5');
  await page.evaluate(() => localStorage.removeItem('dw.mission'));
  await page.evaluate(([la, lo]) => void window.__dw.globe.flyToPlace(la, lo, 400), HOME);
  await cameraRest(page, 25_000);
  await clickAt(page);
  await page.waitForFunction(() => /Ground elevation: [\d,.]+/.test(document.querySelector('#sel-elev')?.textContent ?? ''), null, { timeout: 30_000 });
  await page.click('#place-drone');
  await page.waitForFunction(() => document.querySelector('#drone-progress')?.textContent === 'Ready', null, { timeout: 120_000 });
  await page.evaluate(() => { window.__states = []; window.__dw.bridge().onState((s) => { window.__last = s; window.__states.push(s); }); });
  await page.click('#side-close');

  // plan: 5 clicks around the screen centre (home), then every height 70 m
  await page.click('#mission summary');
  await page.click('#mission-plan');
  const box = await page.locator('#globe canvas').boundingBox();
  for (const [dx, dy] of [[0, -90], [110, -60], [120, 40], [-20, 80], [-120, 0]]) {
    await page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
    await page.waitForTimeout(400);
  }
  await page.click('#mission-plan'); // Plan off
  for (let i = 0; i < 5; i++) {
    const alt = page.locator('#mission-list li').nth(i).locator('.wp-alt');
    await alt.fill('70');
    await alt.dispatchEvent('change');
  }
  const wps = await page.evaluate(() => window.__dw.mission.points());
  const legs = wps.map((w, i) => metres(i ? [wps[i - 1].lat, wps[i - 1].lon] : HOME, [w.lat, w.lon]));
  check('P3.5.2 5 waypoints planned on the globe', wps.length === 5 && wps.every((w) => w.alt === 70), `legs ${legs.map((m) => m.toFixed(0)).join(', ')} m`);

  await page.click('#mission-check');
  await page.waitForFunction(() => /^(Clear|Too close|The terrain)/.test(document.querySelector('#mission-result').textContent), null, { timeout: 60_000 });
  const verdict = await page.locator('#mission-result').innerText();
  check('P3.5.2 the clearance check passes', /^Clear/.test(verdict) && /terrain only/.test(verdict), verdict);

  // fly: Upload and fly (one click on Continue for the pre-flight warnings), until the mission ends (RTL)
  const t0 = Date.now();
  while (Date.now() - t0 < 120_000) {
    await page.click('#mission-fly');
    await page.locator('#pf-continue').click({ timeout: 3000 }).catch(() => {});
    await page.waitForFunction(() => !/Uploading|Taking off/.test(document.querySelector('#mission-progress').textContent), null, { timeout: 60_000 }).catch(() => {});
    if (/Flying|Waypoint/.test(await page.locator('#mission-progress').innerText())) break;
    await page.waitForTimeout(3000);
  }
  await page.waitForFunction(() => window.__last?.mode === 'RTL', null, { timeout: 400_000, polling: 500 }).catch(() => {});
  const auto = await page.evaluate(() => window.__states.filter((s) => s.mode === 'AUTO'));
  const nearest = wps.map((w) => Math.min(...auto.map((s) => metres([s.lat, s.lon], [w.lat, w.lon]))));
  const order = [...new Set(auto.map((s) => s.wp))];
  console.log(`info  ${auto.length} states in Auto; waypoints ${order.join(' > ')}; nearest ${nearest.map((m) => m.toFixed(1)).join(', ')} m`);
  check('P3.5.2 flown in Auto: all 5 reached within 5 m', order.join(',') === '1,2,3,4,5' && nearest.every((m) => m <= 5), nearest.map((m) => m.toFixed(1)).join(', '));
  check('whole run: 0 console errors (apart from handled lookups)', log.errors.filter((e) => !/overpass|mapillary|WebSocket connection|virtualearth/.test(e)).length === 0, log.errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  bridge.kill();
  execSync(`"${PY}" -c "import sitl; sitl.stop_stale()"`, { cwd: BRIDGE });
}
done();
