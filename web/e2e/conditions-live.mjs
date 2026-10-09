// P3.2.2 GPS quality and P3.2.3 battery, live through the Conditions panel (test bridge 8001 and test simulator; needs
// sim/sitl-win). sim/gps-watch.py listens on the simulator's second port for satellites, the raw GPS position against
// SITL's true position, the charge used and the autopilot's messages. Two flights at Pushkar, each from a fresh place:
//   GPS: Loiter at 10 m; good 10 s, weak 20 s, dropout 25 s, good again.
//   Battery: Loiter at 10 m, flown about 150 m from home (so the return home outlasts the drain to critical); start
//   30 %, drain 40 %/min; no key is pressed after that until the autopilot has landed.
import { execSync, spawn } from 'node:child_process';
import { openSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cameraRest, checker, clickAt, open, settledAt } from './lib.mjs';

const { check, done } = checker();
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const BRIDGE = `${ROOT}bridge/`;
const PY = `${BRIDGE}.venv/Scripts/python.exe`;
const RUN = `${ROOT}sim/run-test/`;
const BLOG = `${RUN}bridge-conditions.log`;
const DRAIN = 40; // %/min: 30 % to low (25) in 7.5 s, low to critical (10) in 22.5 s
const med = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : NaN);
const bridge = spawn(PY, ['-u', 'ws_server.py'], { cwd: BRIDGE, stdio: ['ignore', openSync(BLOG, 'w'), openSync(BLOG, 'a')] });
const watch = (seconds, file) => spawn(PY, [`${ROOT}sim/gps-watch.py`, String(seconds), file], { stdio: 'ignore' });
const lines = (file) => readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
const { browser, page, log } = await open('?e2e=1', { viewport: { width: 1280, height: 800 } });
const watchers = [];

async function placeAndHover(again = false) {
  if (!again) { // the second flight places again at the point still selected (the camera now follows the drone)
    await page.evaluate(() => void window.__dw.globe.flyToPlace(26.4897, 74.5511, 1000));
    await cameraRest(page, 25_000);
    await clickAt(page);
    await page.waitForFunction(() => /Ground elevation: [\d,.]+/.test(document.querySelector('#sel-elev')?.textContent ?? ''), null, { timeout: 30_000 });
  }
  await page.evaluate(() => (document.querySelector('#drone-progress').textContent = ''));
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
}
const choose = async (sel, value) => {
  await page.evaluate(() => (document.querySelector('#cond-status').textContent = ''));
  await page.selectOption(sel, value);
  await page.waitForFunction(() => /: (set\.|.+)$/.test(document.querySelector('#cond-status')?.textContent ?? '') && !/asking/.test(document.querySelector('#cond-status').textContent), null, { timeout: 20_000 });
  return page.locator('#cond-status').innerText();
};

try {
  await settledAt(page, 90_000); // tile servers were slow twice on 2026-10-09 (40 s was not enough)
  await page.selectOption('#quality', '0.5'); // less drawing: the simulator falls behind real time when the laptop is busy
  await page.click('#conditions summary');

  const battOnly = process.env.PART === 'battery'; // PART=battery: the battery flight alone
  // ---------- P3.2.2 GPS
  if (!battOnly) {
  const gpsFile = `${RUN}gps-watch.jsonl`;
  await placeAndHover();
  watchers.push(watch(110, gpsFile));
  await page.waitForTimeout(12_000);
  const tWeak = Date.now() / 1000;
  const weakAns = await choose('#cond-gps', 'weak');
  await page.waitForTimeout(20_000);
  const tDrop = Date.now() / 1000;
  const dropAns = await choose('#cond-gps', 'dropout');
  const lost = await page.waitForFunction(() => window.__last?.gpsFix < 3, null, { timeout: 15_000, polling: 50 }).then(() => Date.now() / 1000 - tDrop, () => null);
  const notice = await page.locator('#gps-wait').isVisible().catch(() => false);
  const modes = new Set();
  for (let i = 0; i < 50; i++) { modes.add(await page.evaluate(() => `${window.__last?.mode} ${window.__last?.armed ? 'armed' : 'disarmed'} ${window.__last?.altAgl?.toFixed(0)} m`)); await page.waitForTimeout(500); }
  const tGood = Date.now() / 1000;
  const goodAns = await choose('#cond-gps', 'good');
  const back = await page.waitForFunction(() => window.__last?.gpsFix >= 3, null, { timeout: 30_000, polling: 50 }).then(() => Date.now() / 1000 - tGood, () => null);
  await page.waitForTimeout(3000);
  watchers.pop().kill();
  const g = lines(gpsFile);
  const win = (a, b) => g.filter((x) => 'fix' in x && x.t >= a && x.t < b);
  const base = win(0, tWeak), weak = win(tWeak + 3, tDrop);
  const stat = (w) => ({ sats: med(w.map((x) => x.sats)), err: med(w.map((x) => x.err_m).filter((v) => v !== null)), hacc: med(w.map((x) => x.hacc_m)), fix: [...new Set(w.map((x) => x.fix))] });
  const sb = stat(base), sw = stat(weak), sd = stat(win(tDrop + 5, tGood));
  const texts = [...new Set(g.filter((x) => x.text && x.t >= tDrop).map((x) => x.text))];
  console.log(`info  GPS good: ${JSON.stringify(sb)}; weak: ${JSON.stringify(sw)}; dropout (after 5 s): ${JSON.stringify(sd)}`);
  console.log(`info  GPS answers: ${weakAns} / ${dropAns} / ${goodAns}`);
  console.log(`info  autopilot during dropout: modes ${[...modes].join(' > ')}; messages: ${texts.join(' | ')}`);
  check('P3.2.2 weak lowers the satellite count and raises position error', sw.sats < sb.sats && sw.err > sb.err, `satellites ${sb.sats} to ${sw.sats}; raw GPS error from true position ${sb.err} m to ${sw.err} m (reported accuracy ${sb.hacc} m to ${sw.hacc} m)`);
  check('P3.2.2 dropout drops gpsFix below 3 within 5 s and the UI notice appears', lost !== null && lost <= 5 && notice, `fix below 3 after ${lost?.toFixed(2)} s; notice ${notice ? 'shown' : 'missing'}`);
  check('P3.2.2 good restores fix 3', back !== null, `fix 3 or better again ${back?.toFixed(1)} s after choosing good`);

  }
  // ---------- P3.2.3 battery
  const batFile = `${RUN}battery-watch.jsonl`;
  await placeAndHover(!battOnly);
  // fly out: forward stick for 15 s in Loiter, then let go and settle
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(15_000);
  await page.keyboard.up('ArrowUp');
  await page.waitForTimeout(5000);
  const outM = await page.evaluate(([la, lo]) => { const s = window.__last, R = Math.PI / 180; return 2 * 6371008.8 * Math.asin(Math.sqrt(Math.sin(((s.lat - la) * R) / 2) ** 2 + Math.cos(la * R) * Math.cos(s.lat * R) * Math.sin(((s.lon - lo) * R) / 2) ** 2)); }, [26.4897, 74.5511]);
  watchers.push(watch(200, batFile));
  await page.waitForTimeout(3000);
  await page.fill('#cond-batt-start', '30');
  await page.fill('#cond-batt-drain', String(DRAIN));
  await page.evaluate(() => (document.querySelector('#cond-status').textContent = ''));
  const tBatt = Date.now() / 1000;
  await page.click('#cond-batt-apply');
  await page.waitForFunction(() => /^Battery: /.test(document.querySelector('#cond-status')?.textContent ?? '') && !/asking/.test(document.querySelector('#cond-status').textContent), null, { timeout: 40_000 });
  const battAns = await page.locator('#cond-status').innerText();
  const seen = []; // [t, pct, mode, armed, low notice, critical notice]
  const t0 = Date.now();
  while (Date.now() - t0 < 180_000) {
    const r = await page.evaluate(() => [Date.now() / 1000, window.__last?.batteryPct, window.__last?.mode, window.__last?.armed, !!document.querySelector('#battery-low.notice'), !!document.querySelector('#battery-critical.notice')]);
    seen.push(r);
    if (!r[3] && r[2] === 'LAND') break; // landed and disarmed by the autopilot
    await page.waitForTimeout(250);
  }
  watchers.pop().kill();
  const first = (f) => seen.find(f);
  const low = first((r) => r[4]), crit = first((r) => r[5]), rtl = first((r) => r[2] === 'RTL'), land = first((r) => r[2] === 'LAND');
  const b = lines(batFile);
  const bt = b.filter((x) => x.text && x.t >= tBatt).map((x) => `${(x.t - tBatt).toFixed(1)} s ${x.text} (${x.mode})`);
  // drain at hover: charge used (mAh) over the Loiter stretch before the low failsafe, as % of the capacity set
  const cap = Number(execSync(`"${PY}" -c "import sys; sys.path.insert(0, r'${BRIDGE}'); import commands; print(commands.battery_params(${DRAIN})['BATT_CAPACITY'])"`).toString());
  // the window starts after the reset to 30 % has taken effect and ends when the low failsafe changes the mode
  const tReset = b.find((x) => 'pct' in x && x.t > tBatt && x.pct <= 30)?.t ?? Infinity;
  const hover = b.filter((x) => 'mah' in x && x.t > tReset && x.mode === 'LOITER');
  const rate = hover.length > 4 ? ((hover.at(-1).mah - hover[0].mah) / cap) * 100 / ((hover.at(-1).t - hover[0].t) / 60) : NaN;
  const pctRate = hover.length > 4 ? (hover[0].pct - hover.at(-1).pct) / ((hover.at(-1).t - hover[0].t) / 60) : NaN; // the autopilot's own %, whole points
  // the bridge's flight log: the autopilot's battery messages and the mode changes, as events and samples
  const logFile = [...readFileSync(BLOG, 'utf8').matchAll(/flight log (.+\.jsonl)/g)].at(-1)?.[1];
  const flog = logFile ? readFileSync(logFile.trim(), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
  const logTexts = flog.filter((e) => e.kind === 'autopilot').map((e) => e.text);
  console.log(`info  flown ${outM.toFixed(0)} m from home before the battery change; battery answer: ${battAns}; capacity ${cap} mAh; autopilot messages: ${bt.join(' | ')}`);
  console.log(`info  low notice at ${low?.[1]} % (${low ? (low[0] - tBatt).toFixed(1) : '-'} s), RTL at ${rtl?.[1]} %, critical notice at ${crit?.[1]} %, LAND at ${land?.[1]} %; ended ${seen.at(-1)?.slice(1, 4).join(' ')}`);
  console.log(`info  flight log ${logFile?.trim()}: autopilot events ${logTexts.filter((t) => /batt|fail/i.test(t)).join(' | ')}`);
  check('P3.2.3 start at 30 % with fast drain: low warning, then critical warning shown', !!low && !!crit && crit[0] > low[0] && low[1] <= 30, `low at ${low?.[1]} %, critical at ${crit?.[1]} %`);
  check("P3.2.3 at critical the autopilot's failsafe (return home or land) fires with no key press", !!rtl && !!land && land[0] > rtl[0] && land[1] <= 10 && rtl[1] <= 25, `RTL at ${rtl?.[1]} % (low threshold 25), LAND at ${land?.[1]} % (critical 10); no key pressed after Loiter`);
  check('P3.2.3 the low battery return shows in the flight log', logTexts.some((t) => /battery/i.test(t)) && flog.some((e) => e.kind === 'mode' && e.to === 'RTL'), `${logTexts.filter((t) => /batt/i.test(t)).length} battery messages; mode events ${flog.filter((e) => e.kind === 'mode').map((e) => e.to).join(' > ')}`);
  check(`P3.2.3 measured drain is within +/-10 % of the chosen rate (${DRAIN} %/min, at hover)`, battAns === 'Battery: set.' && Math.abs(rate - DRAIN) <= DRAIN * 0.1, `${battAns}; ${rate.toFixed(2)} %/min from the charge used (the autopilot's own remaining %: ${pctRate.toFixed(1)} %/min) over ${hover.length} readings in Loiter (${hover.length ? ((hover.at(-1).t - hover[0].t)).toFixed(0) : 0} s)`);
  check('whole run: 0 console errors (apart from handled lookups)', log.errors.filter((e) => !/overpass|mapillary|WebSocket connection/.test(e)).length === 0, log.errors.slice(0, 3).join(' | '));
} finally {
  watchers.forEach((w) => w.kill());
  await browser.close();
  bridge.kill();
  execSync(`"${PY}" -c "import sitl; sitl.stop_stale()"`, { cwd: BRIDGE });
}
done();
