// P2A.7.4 key press to visible motion, through the whole chain: keyboard, control layer, WebSocket, bridge, RC override,
// SITL, state stream, smoother, frame. Needs sim/sitl-win (the bridge starts SITL). Place the drone at Pushkar, T to take
// off, 1 for Loiter, then 50 presses of the roll keys (right and left in turn, 0.6 s each, 1.5 s apart): for each, the
// keydown time (taken only when the drawn roll is steady) and the first rendered frame whose drawn roll has moved more
// than 0.5 degrees in the key's direction, both on the page's clock.
import { execSync, spawn } from 'node:child_process';
import { openSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cameraRest, checker, clickAt, open, settledAt } from './lib.mjs';

const { check, done } = checker();
const BRIDGE = fileURLToPath(new URL('../../bridge/', import.meta.url));
const PY = `${BRIDGE}.venv/Scripts/python.exe`;
const PRESSES = Number(process.env.PRESSES ?? 50);
const BLOG = fileURLToPath(new URL('../../sim/run-test/bridge-latency.log', import.meta.url));
const bridge = spawn(PY, ['-u', 'ws_server.py'], { cwd: BRIDGE, stdio: ['ignore', openSync(BLOG, 'w'), openSync(BLOG, 'a')], env: { ...process.env, DW_PROBE: '1' } });
const { browser, page, log } = await open('?e2e=1', { viewport: { width: 1280, height: 800 } });
const pct = (a, p) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.ceil((p / 100) * a.length) - 1)];
try {
  await settledAt(page, 40_000);
  await page.evaluate(() => void window.__dw.globe.flyToPlace(26.4897, 74.5511, 1000));
  await cameraRest(page, 25_000);
  await clickAt(page);
  await page.waitForFunction(() => /Ground elevation: [\d,.]+/.test(document.querySelector('#sel-elev')?.textContent ?? ''), null, { timeout: 30_000 });
  await page.click('#place-drone');
  await page.waitForFunction(() => document.querySelector('#drone-progress')?.textContent === 'Ready', null, { timeout: 120_000 });
  await page.evaluate(() => window.__dw.bridge().onState((s) => (window.__last = s)));
  // T until airborne (the autopilot refuses while its position estimate settles), then Loiter
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
  const MODE = process.env.MODE ?? 'LOITER'; // LOITER (key 1) or ALT_HOLD (key 2)
  await page.keyboard.press(MODE === 'ALT_HOLD' ? '2' : '1');
  await page.waitForFunction((m) => window.__last?.mode === m, MODE, { timeout: 10_000 });
  await page.waitForTimeout(2000);

  await page.evaluate((n) => (window.__noRamp = n), process.env.NORAMP === '1');
  await page.evaluate(() => {
    const send = WebSocket.prototype.send;
    WebSocket.prototype.send = function (d) {
      const m = JSON.parse(d);
      if ('roll' in m && window.__probe) window.__probe('sent', m.roll);
      return send.call(this, d);
    };
    window.__dw.bridge().onState((s) => window.__probeState?.(s));
    window.__lat = [];
    window.addEventListener('keydown', (ev) => {
      if (!ev.key.startsWith('Arrow') || ev.repeat) return;
      const t = performance.now();
      const r0 = window.__dw.drone.drawn().roll;
      const dir = ev.key === 'ArrowRight' ? 1 : -1; // right roll is positive
      if (window.__noRamp) window.__dw.sticks.pos.right = dir * 0.6; // measurement only: skip the ramp (NORAMP=1)
      const scene = window.__dw.viewer.scene;
      // breakdown: first ControlInput sent with roll this way, first state received with roll moved 0.5 degrees
      const rec = { sent: null, state: null, frame: null };
      window.__probe = (kind, v) => { if (rec[kind] === null && v * dir > (kind === 'sent' ? 0 : 0.5)) rec[kind] = performance.now() - t; };
      const s0 = window.__last?.rollDeg ?? 0;
      window.__probeState = (s) => window.__probe('state', s.rollDeg - s0);
      const off = scene.postRender.addEventListener(() => {
        if ((window.__dw.drone.drawn().roll - r0) * dir > 0.5) {
          off();
          window.__lat.push(performance.now() - t);
          rec.frame = performance.now() - t;
          (window.__parts ??= []).push(rec);
        }
      });
      setTimeout(off, 2000); // no motion within 2 s: counted as missing
    }, true);
  });
  // a press counts only from a steady drone: drawn roll changing by less than 0.2 degrees over 300 ms
  const steady = () => page.waitForFunction(() => new Promise((res) => { const a = window.__dw.drone.drawn().roll; setTimeout(() => res(Math.abs(window.__dw.drone.drawn().roll - a) < 0.2), 300); }), null, { timeout: 10_000, polling: 100 });
  for (let i = 0; i < PRESSES; i++) {
    const key = i % 2 ? 'ArrowLeft' : 'ArrowRight';
    await steady();
    await page.keyboard.down(key);
    await page.waitForTimeout(600);
    await page.keyboard.up(key);
    await page.waitForTimeout(1500);
  }
  const lat = await page.evaluate(() => window.__lat);
  const parts = await page.evaluate(() => window.__parts ?? []);
  const med = (k) => pct(parts.map((p) => p[k]).filter((v) => v !== null), 50);
  console.log(`info  mode ${MODE}${process.env.NORAMP === '1' ? ', no ramp' : ''}; breakdown (median ms from keydown): first stick sent ${med('sent')?.toFixed(0)}, first state showing the roll ${med('state')?.toFixed(0)}, first frame showing it ${pct(lat, 50)?.toFixed(0)}`);
  // the split the owner asked for (2026-10-09): numbers only, the 200 ms target is not changed
  const probes = [...readFileSync(BLOG, 'utf8').matchAll(/probe: input->rc ([\d.]+) ms, rc->state ([\d.]+) ms/g)].map((m) => [Number(m[1]), Number(m[2])]);
  const ok = parts.filter((p) => p.sent !== null && p.state !== null && p.frame !== null);
  const row = (name, xs) => `${name}: n ${xs.length}, median ${pct(xs, 50)?.toFixed(1)}, p95 ${pct(xs, 95)?.toFixed(1)}, worst ${Math.max(...xs).toFixed(1)} ms`;
  console.log('split ' + row('A1 keydown to ControlInput sent (browser clock)', ok.map((p) => p.sent)));
  console.log('split ' + row('A2 ControlInput in to RC override sent (bridge clock)', probes.map((p) => p[0])));
  console.log('split ' + row('B  RC override sent to first changed state from the simulator (bridge clock)', probes.map((p) => p[1])));
  console.log('split ' + row('C  state received to first drawn frame showing it (browser clock)', ok.map((p) => p.frame - p.state)));
  console.log('split ' + row('total keydown to drawn frame (browser clock)', lat));
  console.log('split ' + row('rest: WebSocket both ways (total - A1 - C, minus median A2 + B)', ok.map((p) => p.state - p.sent - (pct(probes.map((q) => q[0] + q[1]), 50) ?? 0))));
  const p50 = pct(lat, 50), p95 = pct(lat, 95);
  console.log(`info  ${lat.length} of ${PRESSES} presses moved the drone; ms: ${lat.map((x) => x.toFixed(0)).join(' ')}`);
  check('P2A.7.4 key press to visible motion: 95th percentile under 200 ms over 50 presses', lat.length === PRESSES && p95 < 200, `median ${p50?.toFixed(0)} ms, 95th percentile ${p95?.toFixed(0)} ms, worst ${Math.max(...lat).toFixed(0)} ms, ${lat.length}/${PRESSES} moved`);
  check('whole run: 0 console errors (apart from handled lookups)', log.errors.filter((e) => !/overpass|mapillary|WebSocket connection/.test(e)).length === 0, log.errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  bridge.kill();
  execSync(`"${PY}" -c "import sitl; sitl.stop_stale()"`, { cwd: BRIDGE });
}
done();
