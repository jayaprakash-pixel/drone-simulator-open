// P3.3.3 mission upload and Auto flight, and P3.3.4 geofence, live (test bridge 8001 and test simulator; needs
// sim/sitl-win and terrain). Pushkar. Flight 1: 5 waypoints 40-60 m apart at 15-25 m, Upload and fly from the Mission
// panel: the upload is accepted (MISSION_ACK), the waypoint shown advances 1 to 5, the drone passes within 5 m of each,
// the screen shows "Waypoint n of 5". Flight 2: fence 120 m high and 100 m from home, breach returns home; a mission to a
// point 200 m out crosses it: the breach and RTL come with no key press, the ring is drawn, the flight log has the breach.
import { execSync, spawn } from 'node:child_process';
import { openSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cameraRest, checker, clickAt, open, settledAt } from './lib.mjs';

const { check, done } = checker();
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const BRIDGE = `${ROOT}bridge/`;
const PY = `${BRIDGE}.venv/Scripts/python.exe`;
const BLOG = `${ROOT}sim/run-test/bridge-mission.log`;
const HOME = [26.4897, 74.5511];
const R = Math.PI / 180;
const metres = (a, b) => 2 * 6_371_008.8 * Math.asin(Math.sqrt(Math.sin(((b[0] - a[0]) * R) / 2) ** 2 + Math.cos(a[0] * R) * Math.cos(b[0] * R) * Math.sin(((b[1] - a[1]) * R) / 2) ** 2));
const offset = ([n, e], alt, speed = 5) => ({ lat: HOME[0] + n / 111_195, lon: HOME[1] + e / (111_195 * Math.cos(HOME[0] * R)), alt, speed });
const bridge = spawn(PY, ['-u', 'ws_server.py'], { cwd: BRIDGE, stdio: ['ignore', openSync(BLOG, 'w'), openSync(BLOG, 'a')] });
const { browser, page, log } = await open('?e2e=1', { viewport: { width: 1280, height: 800 } });

async function place(first) {
  if (first) {
    await page.evaluate(([la, lo]) => void window.__dw.globe.flyToPlace(la, lo, 1000), HOME);
    await cameraRest(page, 25_000);
    await clickAt(page);
    await page.waitForFunction(() => /Ground elevation: [\d,.]+/.test(document.querySelector('#sel-elev')?.textContent ?? ''), null, { timeout: 30_000 });
  }
  await page.evaluate(() => (document.querySelector('#drone-progress').textContent = ''));
  await page.click('#place-drone');
  await page.waitForFunction(() => document.querySelector('#drone-progress')?.textContent === 'Ready', null, { timeout: 120_000 });
  await page.evaluate(() => { window.__states = []; window.__dw.bridge().onState((s) => { window.__last = s; window.__states.push(s); }); });
  const home = await page.evaluate(() => window.__dw.marker('selected'));
  return home;
}
const setMission = (wps) => page.evaluate((w) => { localStorage.setItem('dw.mission', JSON.stringify(w)); }, wps);
async function flyMission(seconds, until) {
  // Upload and fly retries while the autopilot is not ready to arm (it refuses for its first seconds)
  const t0 = Date.now();
  let said = '';
  while (Date.now() - t0 < 120_000) {
    await page.click('#mission-fly');
    await page.locator('#pf-continue').click({ timeout: 3000 }).catch(() => {}); // pre-flight warnings (P3.3.5): one click
    await page.waitForFunction(() => !/Uploading|Taking off/.test(document.querySelector('#mission-progress').textContent), null, { timeout: 60_000 }).catch(() => {});
    said = await page.locator('#mission-progress').innerText();
    if (/Flying|Waypoint/.test(said)) break;
    await page.waitForTimeout(3000);
  }
  const shown = new Set();
  const t1 = Date.now();
  while (Date.now() - t1 < seconds * 1000) {
    shown.add(await page.locator('#mission-progress').innerText());
    if (await page.evaluate(until)) break;
    await page.waitForTimeout(250);
  }
  return { said, shown: [...shown] };
}

try {
  await settledAt(page, 90_000);
  await page.selectOption('#quality', '0.5'); // less drawing: the simulator keeps real time better
  // ---------- flight 1: P3.3.3
  const wps = [offset([40, 0], 15), offset([40, 50], 20), offset([0, 60], 25), offset([-40, 30], 20), offset([-30, -20], 15)];
  await setMission(wps);
  await page.reload({ waitUntil: 'load' });
  await settledAt(page, 90_000);
  await page.selectOption('#quality', '0.5');
  await page.click('#mission summary');
  await place(true);
  const f1 = await flyMission(240, () => window.__last?.mode === 'RTL' || (window.__last?.wp === 5 && !window.__last?.armed));
  const states = await page.evaluate(() => window.__states.filter((s) => s.mode === 'AUTO'));
  const order = [...new Set(states.map((s) => s.wp))];
  const nearest = wps.map((w) => Math.min(...states.map((s) => metres([s.lat, s.lon], [w.lat, w.lon]))));
  const ack = /command mission\s+-> ok/.test(readFileSync(BLOG, 'utf8'));
  console.log(`info  flight 1: "${f1.said}"; shown ${f1.shown.join(' | ')}; waypoint order ${order.join(' > ')}; nearest pass per waypoint ${nearest.map((m) => m.toFixed(1)).join(', ')} m`);
  check('P3.3.3 a 5-waypoint mission uploads (MISSION_ACK accepted)', ack, ack ? 'bridge: command mission -> ok' : 'no accepted upload in the bridge log');
  check('P3.3.3 the current waypoint advances 1 to 5', order.join(',') === '1,2,3,4,5', order.join(' > '));
  check('P3.3.3 the drone comes within 5 m of each waypoint', nearest.every((m) => m <= 5), nearest.map((m) => m.toFixed(1)).join(', '));
  check("P3.3.3 the screen shows 'waypoint n of 5'", [1, 2, 3, 4, 5].every((n) => f1.shown.includes(`Waypoint ${n} of 5`)), f1.shown.join(' | '));

  // ---------- flight 2: P3.3.4 (a fresh place; the fence circle is centred on home)
  await place(false);
  await page.fill('#fence-alt', '120');
  await page.fill('#fence-radius', '100');
  await page.selectOption('#fence-breach', 'rtl');
  await page.evaluate(() => (document.querySelector('#fence-status').textContent = ''));
  await page.click('#fence-set');
  await page.waitForFunction(() => /^Fence/.test(document.querySelector('#fence-status').textContent) && !/Setting/.test(document.querySelector('#fence-status').textContent), null, { timeout: 30_000 });
  const fenceAns = await page.locator('#fence-status').innerText();
  const params = [...readFileSync(BLOG, 'utf8').matchAll(/command fence\s+-> (.+)/g)].at(-1)?.[1];
  const ring = await page.evaluate(() => { const e = window.__dw.viewer.entities.getById('fence-ring'); return e ? e.ellipse.semiMajorAxis.getValue() : null; });
  await page.evaluate((w) => window.__dw.mission.set(w), [offset([200, 0], 20, 6)]); // one point 200 m out: past the fence
  await page.evaluate(() => (window.__states = []));
  const f2 = await flyMission(120, () => window.__last?.mode === 'RTL');
  const s2 = await page.evaluate(() => window.__states);
  const rtlAt = s2.find((s) => s.mode === 'RTL');
  const maxOut = Math.max(...s2.map((s) => metres([s.lat, s.lon], HOME)));
  const logFile = [...readFileSync(BLOG, 'utf8').matchAll(/flight log (.+\.jsonl)/g)].at(-1)?.[1]?.trim();
  const flog = logFile ? readFileSync(logFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
  // the breach itself: the bridge's 'fence breach' event (from the autopilot's FENCE_STATUS), or the autopilot saying so
  const breach = flog.filter((e) => e.kind === 'fence breach' || (e.kind === 'autopilot' && /breach/i.test(e.text))).map((e) => `${e.t.slice(11, 19)} ${e.kind}${e.text ? ': ' + e.text : ''}`);
  console.log(`info  flight 2: fence "${fenceAns}" (bridge: ${params}); ring radius ${ring} m; "${f2.said}"; RTL at ${rtlAt ? metres([rtlAt.lat, rtlAt.lon], HOME).toFixed(0) : '-'} m from home; furthest ${maxOut.toFixed(0)} m; log: ${breach.join(' | ')}`);
  check('P3.3.4 fence parameters read back equal', params === 'ok' && /^Fence on/.test(fenceAns), `${params}; ${fenceAns}`);
  check('P3.3.4 with max distance 100 m, flying past it triggers the breach event and RTL with no key press', !!rtlAt && metres([rtlAt.lat, rtlAt.lon], HOME) >= 90 && breach.length > 0, `RTL ${rtlAt ? metres([rtlAt.lat, rtlAt.lon], HOME).toFixed(0) + ' m from home' : 'never'}; autopilot said: ${breach.join(' | ') || 'nothing about the fence'}`);
  check('P3.3.4 the boundary is drawn on the globe', ring === 100, `ring radius ${ring} m`);
  check('whole run: 0 console errors (apart from handled lookups)', log.errors.filter((e) => !/overpass|mapillary|WebSocket connection/.test(e)).length === 0, log.errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  bridge.kill();
  execSync(`"${PY}" -c "import sitl; sitl.stop_stale()"`, { cwd: BRIDGE });
}
done();
