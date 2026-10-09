// P2B.3.4 failure drills for Phase 2b: the P2A.7.7 drills again, plus unplugging the controller, with a controller active
// (stubbed Gamepad API, calibrated profile) during one live flight (real bridge and SITL; needs sim/sitl-win). SITL's own
// mode is read on its second MAVLink port (bridge/tests/sitl_mode.py), independent of the bridge.
//   0 unplug the controller (drone in AltHold) -> Loiter
//   1 close the tab (drone in AltHold)  -> Loiter or RTL
//   2 wrong Cesium ion token            -> its message; the drone keeps flying
//   3 lose the internet                 -> the offline message
//   4 kill the bridge                   -> Loiter or RTL (GCS failsafe: FS_GCS_ENABLE 1, 2 s, sim/copter-min.parm)
// Results are appended to docs/drills.md.
import { appendFileSync } from 'node:fs';
import { execSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cameraRest, checker, clickAt, open, settledAt, stubGamepad } from './lib.mjs';

const { check, done } = checker();
const BRIDGE = fileURLToPath(new URL('../../bridge/', import.meta.url));
const PY = `${BRIDGE}.venv/Scripts/python.exe`;
const sitlMode = (s = 2) => execSync(`"${PY}" tests/sitl_mode.py ${s}`, { cwd: BRIDGE }).toString().trim();
const results = [];
const note = (drill, outcome, ok) => results.push(`| ${drill} | ${outcome} | ${ok ? 'pass' : 'FAIL'} |`);

let bridge = spawn(PY, ['ws_server.py'], { cwd: BRIDGE, stdio: 'ignore' });
const PAD = 'Drill Pad (Vendor: 0003 Product: 0004)';
const a = await open('?e2e=1', { viewport: { width: 1280, height: 800 }, setup: stubGamepad });
let b = null;
try {
  const page = a.page;
  await settledAt(page, 40_000);
  await page.evaluate(() => void window.__dw.globe.flyToPlace(26.4897, 74.5511, 1000));
  await cameraRest(page, 25_000);
  await clickAt(page);
  await page.waitForFunction(() => /Ground elevation: [\d,.]+/.test(document.querySelector('#sel-elev')?.textContent ?? ''), null, { timeout: 30_000 });
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
  await page.keyboard.press('2'); // AltHold, so the drill shows the switch
  await page.waitForFunction(() => window.__last?.mode === 'ALT_HOLD', null, { timeout: 10_000 });
  // the controller takes over (calibrated profile, centred sticks)
  await page.evaluate((id) => {
    localStorage.setItem(`dw.pad.${id}`, JSON.stringify({ id, cal: [0, 1, 2, 3].map(() => ({ min: -1, max: 1, centre: 0 })), mode: 2, invert: { throttle: false, yaw: false, pitch: false, roll: false }, buttons: {}, deadzone: 0.05, expo: 0.3 }));
    window.__pad.connect(id);
    window.__pad.set([0, 0, 0, 0]);
  }, PAD);
  await page.waitForFunction(() => document.getElementById('input-indicator')?.innerText === 'Input: Controller', null, { timeout: 5000 });

  // 0 unplug the controller
  await page.evaluate(() => window.__pad.disconnect());
  await new Promise((r) => setTimeout(r, 1500));
  const m0 = sitlMode(1);
  const ok0 = /^LOITER armed/.test(m0);
  check('P2B.3.4 drill 0, unplug the controller mid-flight: Loiter (keyboard keeps the sticks)', ok0, m0);
  note('Unplug the controller mid-flight (drone in AltHold, controller active)', `SITL 1.5-2.5 s later: ${m0}`, ok0);
  await page.keyboard.press('2'); // back to AltHold for the next drills
  await page.waitForFunction(() => window.__last?.mode === 'ALT_HOLD', null, { timeout: 10_000 });
  await page.evaluate((id) => { window.__pad.connect(id); window.__pad.set([0, 0, 0, 0]); }, PAD);

  // 2 wrong token, on a second page during the flight (the first stays connected, so no link loss)
  b = await open('?e2e=1&bridge', { setup: (ctx) => ctx.addInitScript(() => localStorage.setItem('dw.settings', JSON.stringify({ ionToken: 'not-a-real-token' }))) });
  const tokenMsg = await b.page.waitForSelector('#token-bad', { timeout: 20_000 }).then((e) => e.innerText(), () => null);
  const flying = await b.page.waitForFunction(() => document.getElementById('instruments')?.checkVisibility() && /ARMED/.test(document.getElementById('instruments').innerText), null, { timeout: 20_000 }).then(() => true, () => false);
  const ok2 = Boolean(tokenMsg) && flying;
  check('P2B.3.4 drill 2, wrong token: its message shows and the drone keeps flying (instruments live)', ok2, `${tokenMsg?.slice(0, 90)}; instruments live ${flying}`);
  note('Wrong Cesium ion token (second page during the flight)', `message: "${tokenMsg?.slice(0, 80)}…"; instruments still showing ARMED: ${flying}`, ok2);

  // 3 lose the internet on that page
  await b.context.setOffline(true);
  const offMsg = await b.page.waitForSelector('#offline', { timeout: 10_000 }).then((e) => e.innerText(), () => null);
  await new Promise((r) => setTimeout(r, 2000));
  const m3 = sitlMode();
  const ok3 = Boolean(offMsg) && /^ALT_HOLD armed/.test(m3);
  check('P2B.3.4 drill 3, lose the internet: the offline message shows; the drone flies on', ok3, `${offMsg?.slice(0, 80)}; SITL ${m3}`);
  note('Lose the internet (browser offline)', `message: "${offMsg?.slice(0, 80)}…"; SITL: ${m3}`, ok3);
  await b.browser.close();
  b = null;

  // 1 close the tab: the last browser goes (drone in AltHold)
  await page.close();
  await new Promise((r) => setTimeout(r, 3000));
  const m1 = sitlMode();
  const ok1 = /^(LOITER|RTL) armed/.test(m1);
  check('P2B.3.4 drill 1, close the tab mid-flight: the drone is in Loiter or RTL 3 s later', ok1, m1);
  note('Close the tab mid-flight (drone in AltHold)', `SITL 3 s later: ${m1}`, ok1);

  // 4 kill the bridge: first take the drone back into AltHold from a fresh connection, then kill the bridge
  const ws = new WebSocket(`ws://127.0.0.1:${process.env.DW_BRIDGE_PORT}`);
  await new Promise((r) => (ws.onopen = r));
  ws.send(JSON.stringify({ type: 'command', id: 1, command: 'mode', mode: 'altHold' }));
  const neutral = setInterval(() => ws.send(JSON.stringify({ throttle: 0.5, yaw: 0, pitch: 0, roll: 0 })), 40);
  await new Promise((r) => setTimeout(r, 3000));
  const m4a = sitlMode(1);
  clearInterval(neutral);
  bridge.kill();
  await new Promise((r) => setTimeout(r, 4000));
  const m4 = sitlMode();
  const ok4 = /^ALT_HOLD armed/.test(m4a) && /^(LOITER|RTL) armed/.test(m4);
  check('P2B.3.4 drill 4, kill the bridge mid-flight: the drone is in Loiter or RTL 4 s later', ok4, `before ${m4a}, after ${m4}`);
  note('Kill the bridge mid-flight (drone in AltHold)', `SITL before: ${m4a}; 4 s later: ${m4} (GCS failsafe, 2 s without the bridge's heartbeat)`, ok4);
} finally {
  await a.browser.close().catch(() => {});
  await b?.browser.close().catch(() => {});
  bridge.kill();
  execSync(`"${PY}" -c "import sitl; sitl.stop_stale()"`, { cwd: BRIDGE });
}
const doc = new URL('../../docs/drills.md', import.meta.url);
appendFileSync(doc, `\n## Phase 2b drills, controller active (P2B.3.4, \`npm run e2e:drills2b\`, ${new Date().toISOString().slice(0, 10)})\nOne live flight at Pushkar (real bridge and SITL) with a stubbed controller (Gamepad API stub, calibrated profile) in control, each drill once.\n\n| Drill | What happened | Result |\n|---|---|---|\n${results.join('\n')}\n`);
console.log(`info  appended ${results.length} rows to docs/drills.md`);
done();
