// P2A.5.3 the flight buttons in a real browser (the rule table is tested in src/ui/flight-buttons.test.ts): disabled
// buttons carry their reason as visible text under the row, not only as a tooltip. Checked with no bridge
// (disconnected), then through a recorded SITL flight replayed by the bridge: disarmed on the ground with a GPS fix,
// and airborne.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checker, open } from './lib.mjs';

const { check, done } = checker();
const BRIDGE = fileURLToPath(new URL('../../bridge/', import.meta.url));
const appErrors = (log) => log.errors.filter((e) => !/WebSocket connection to 'ws:\/\/127.0.0.1:800[01]\/' failed/.test(e));
const panel = (page) =>
  page.evaluate(() => {
    const list = document.querySelector('#flight-reasons');
    const btn = (id) => document.querySelector(`#fb-${id}`);
    return {
      visible: Boolean(list?.checkVisibility()) && list.offsetHeight > 0,
      text: list?.innerText ?? '',
      disabled: Object.fromEntries(['arm', 'disarm', 'takeoff', 'land', 'rtl', 'loiter', 'altHold', 'stabilize'].map((b) => [b, btn(b)?.disabled])),
      state: window.__last ?? null,
    };
  });

let bridge = null;
const { browser, page, log } = await open('?e2e=1&notoken=1&bridge', { viewport: { width: 1100, height: 750 } });
try {
  await page.waitForSelector('#flight-buttons', { timeout: 20_000 });
  await page.waitForTimeout(1500);
  const off = await panel(page);
  check('P2A.5.3 disconnected: every button disabled and the reason is visible text', off.visible && Object.values(off.disabled).every(Boolean) && /Not connected to the drone/.test(off.text), off.text.replace(/\n/g, ' | '));

  bridge = spawn(`${BRIDGE}.venv\\Scripts\\python.exe`, ['ws_server.py', '--replay', 'tests\\fixtures\\flight.tlog'], { cwd: BRIDGE, stdio: 'ignore' });
  await page.waitForFunction(() => document.querySelector('#bridge-status')?.textContent === 'connected', null, { timeout: 20_000 });
  await page.evaluate(() => window.__dw.bridge().onState((s) => (window.__last = s)));

  await page.waitForFunction(() => window.__last && !window.__last.armed && window.__last.gpsFix >= 3, null, { timeout: 60_000, polling: 100 });
  await page.waitForTimeout(200);
  const ground = await panel(page);
  check('P2A.5.3 disarmed on the ground: Arm enabled, Take off disabled with "Arm first" shown as text',
    ground.visible && ground.disabled.arm === false && ground.disabled.takeoff === true && /Take off: Arm first/.test(ground.text) && /Already on the ground/.test(ground.text),
    ground.text.replace(/\n/g, ' | '));

  await page.waitForFunction(() => window.__last?.armed && window.__last.altAgl > 2, null, { timeout: 150_000, polling: 100 });
  await page.waitForTimeout(200);
  const air = await panel(page);
  check('P2A.5.3 airborne: Land and Return home enabled, Arm and Take off disabled with their reasons shown as text',
    air.visible && air.disabled.land === false && air.disabled.rtl === false && air.disabled.arm === true && air.disabled.takeoff === true && /Already armed/.test(air.text) && /Already flying/.test(air.text),
    air.text.replace(/\n/g, ' | '));
  check('whole run: 0 console errors apart from expected bridge reconnects', appErrors(log).length === 0, appErrors(log).slice(0, 3).join(' | '));
} finally {
  await browser.close();
  bridge?.kill();
}
done();
