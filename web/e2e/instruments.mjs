// P2A.6.1 instruments and notices.
//  1. A recorded SITL flight replayed by the bridge, started after the page so the recorded boot (no GPS fix yet) is
//     seen: every instrument shows the latest state's value, AGL and MSL each carry their label, and the notice
//     'GPS not ready, wait' shows while the fix is below 3D and clears once it is 3D or better.
//  2. Synthetic states (no bridge): 'Battery low, return home' shows below 25 percent (decisions.md) and clears above.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checker, open } from './lib.mjs';

const { check, done } = checker();
const BRIDGE = fileURLToPath(new URL('../../bridge/', import.meta.url));
const appErrors = (log) => log.errors.filter((e) => !/WebSocket connection to 'ws:\/\/127.0.0.1:800[01]\/' failed/.test(e));
const notice = (page, id) => page.evaluate((id) => document.getElementById(id)?.textContent ?? null, id);

// ---- 1. replay
{
  let bridge = null;
  const { browser, page, log } = await open('?e2e=1&notoken=1&bridge', { viewport: { width: 1100, height: 750 } });
  try {
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      window.__gpsSeen = [];
      window.__dw.bridge().onState((s) => {
        window.__last = s;
        window.__gpsSeen.push([s.gpsFix, document.getElementById('gps-wait')?.textContent ?? null]);
      });
    });
    bridge = spawn(`${BRIDGE}.venv/Scripts/python.exe`, ['ws_server.py', '--replay', 'tests/fixtures/flight.tlog'], { cwd: BRIDGE, stdio: 'ignore' });
    await page.waitForFunction(() => window.__last?.gpsFix >= 3, null, { timeout: 60_000, polling: 100 });
    await page.waitForTimeout(1000);
    // the app's own state handler runs before this test's (it was registered first), so each entry pairs a state with
    // the notice as it stands after that state
    const seen = await page.evaluate(() => window.__gpsSeen);
    const noFix = seen.filter(([f]) => f < 3);
    const fix = seen.filter(([f]) => f >= 3);
    const shownWhileNoFix = noFix.every(([, t]) => t === 'GPS not ready, wait');
    const clearedAfter = fix.every(([, t]) => t === null);
    check("P2A.6.1 'GPS not ready, wait' shows while the fix is below 3D and clears once it is 3D", noFix.length > 0 && shownWhileNoFix && clearedAfter && (await notice(page, 'gps-wait')) === null, `${noFix.length} states without a fix (notice shown: ${shownWhileNoFix}), then ${fix.length} with (cleared: ${clearedAfter})`);

    let worst = '', ok = true, n = 0;
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(150);
      const r = await page.evaluate(() => {
        const s = window.__last;
        const v = (id) => document.getElementById(id)?.dataset.value;
        const t = (id) => document.getElementById(id)?.textContent ?? '';
        const h = document.getElementById('inst-horizon').dataset;
        return { s, got: { agl: +v('inst-agl'), msl: +v('inst-msl'), gs: +v('inst-gs'), vs: +v('inst-vs'), hdg: +v('inst-hdg'), bat: +v('inst-bat'), mode: v('inst-mode'), armed: v('inst-armed'), gps: +v('inst-gps'), roll: +h.roll, pitch: +h.pitch }, aglText: t('inst-agl'), mslText: t('inst-msl'), visible: document.getElementById('instruments').checkVisibility() };
      });
      const { s, got } = r;
      const want = { agl: s.altAgl, msl: s.altMsl, gs: s.groundSpeed, vs: s.verticalSpeed, hdg: s.headingDeg, bat: s.batteryPct, mode: s.mode, armed: String(s.armed), gps: s.gpsFix, roll: s.rollDeg, pitch: s.pitchDeg };
      const bad = Object.keys(want).filter((k) => got[k] !== want[k]);
      const labels = /m AGL/.test(r.aglText) && /m MSL/.test(r.mslText);
      if (bad.length || !labels || !r.visible) {
        ok = false;
        worst ||= `differs: ${bad.map((k) => `${k} ${got[k]} vs ${want[k]}`).join(', ')}; labels ${labels}; visible ${r.visible}`;
      }
      n++;
    }
    check('P2A.6.1 AGL and MSL (each labelled), ground and vertical speed, compass, battery, mode, armed, GPS fix and the horizon show the state values', ok, worst || `${n} samples, all equal, e.g. ${await page.evaluate(() => document.getElementById('instruments').innerText.replace(/\n/g, ' · '))}`);
    check('part 1: 0 console errors apart from expected bridge reconnects', appErrors(log).length === 0, appErrors(log).slice(0, 3).join(' | '));
  } finally {
    await browser.close();
    bridge?.kill();
  }
}

// ---- 2. battery notice with synthetic states
{
  const { browser, page, log } = await open('?e2e=1&notoken=1', { viewport: { width: 1100, height: 750 } });
  try {
    await page.waitForFunction(() => window.__dw?.settled(), null, { timeout: 40_000 });
    const set = (bat) => page.evaluate((bat) => window.__dw.instruments({ t: new Date().toISOString(), lat: 26.4897, lon: 74.5511, altMsl: 513, altAgl: 10, headingDeg: 90, pitchDeg: 0, rollDeg: 0, groundSpeed: 0, verticalSpeed: 0, batteryPct: bat, mode: 'LOITER', armed: true, gpsFix: 6 }), bat);
    await set(24);
    const low = await notice(page, 'battery-low');
    await set(26);
    const cleared = await notice(page, 'battery-low');
    check("P2A.6.1 'Battery low, return home' shows below 25 percent and clears above it", low === 'Battery low, return home' && cleared === null, `24 %: ${low}; 26 %: ${cleared}`);
    check('part 2: 0 console errors', log.errors.length === 0, log.errors.slice(0, 3).join(' | '));
  } finally {
    await browser.close();
  }
}
done();
