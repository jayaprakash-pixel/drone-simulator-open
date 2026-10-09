// P2A.3.1 the browser's bridge client and debug panel, against the bridge in replay mode (a recorded SITL flight, no
// simulator): the panel's raw DroneState updates at least 20 times a second; killing the bridge shows 'disconnected'
// within 2 s; restarting it reconnects and the updates resume without a page reload.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checker, open } from './lib.mjs';

const { check, done } = checker();
const BRIDGE = fileURLToPath(new URL('../../bridge/', import.meta.url));
const startBridge = () => spawn(`${BRIDGE}.venv\\Scripts\\python.exe`, ['ws_server.py', '--replay', 'tests\\fixtures\\flight.tlog'], { cwd: BRIDGE, stdio: 'ignore' });
// Edge logs a failed WebSocket connect as a console error; while the bridge is down that is expected and shown in the panel
const appErrors = (log) => log.errors.filter((e) => !/WebSocket connection to 'ws:\/\/127.0.0.1:800[01]\/' failed/.test(e));
const updatesPerSecond = (page, ms = 3000) =>
  page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        let n = 0;
        const mo = new MutationObserver(() => n++);
        mo.observe(document.querySelector('#bridge-raw'), { childList: true, characterData: true, subtree: true });
        setTimeout(() => (mo.disconnect(), resolve((n * 1000) / ms)), ms);
      }),
    ms,
  );
// the replay starts at the recorded SITL boot, where the simulator itself sends little (no complete state for seconds);
// measured 2026-10-09: 15 per second in the first 3 s after connecting, then 25 and 25. Measure after that part.
const BOOT_MS = 4000;
const statusIs = (page, s, timeout) =>
  page.waitForFunction((s) => document.querySelector('#bridge-status')?.textContent === s, s, { timeout, polling: 50 }).then(() => true, () => false);

let bridge = startBridge();
const { browser, page, log } = await open('?e2e=1&notoken=1&bridge', { viewport: { width: 1000, height: 700 } });
try {
  check('P2A.3.1 the debug panel connects to the bridge', await statusIs(page, 'connected', 15_000));
  await page.evaluate(() => (window.__sameLoad = true));
  await page.waitForTimeout(BOOT_MS);
  const rate = await updatesPerSecond(page);
  check('P2A.3.1 the raw DroneState updates at least 20 times a second', rate >= 20, `${rate.toFixed(1)} per second`);
  const t0 = Date.now();
  bridge.kill();
  const gone = await statusIs(page, 'disconnected', 2000);
  check("P2A.3.1 killing the bridge shows 'disconnected' within 2 s", gone, `${Date.now() - t0} ms`);
  bridge = startBridge();
  const back = await statusIs(page, 'connected', 15_000);
  if (back) await page.waitForTimeout(BOOT_MS);
  const rate2 = back ? await updatesPerSecond(page) : 0;
  const same = await page.evaluate(() => window.__sameLoad === true);
  check('P2A.3.1 restarting the bridge reconnects and updates resume without a page reload', back && rate2 >= 20 && same, `${rate2.toFixed(1)} per second, same page load ${same}`);
  check('P2A.3.1 no DroneState dropped by the contract check', (await page.evaluate(() => window.__dw.bridge().dropped)) === 0);
  check('whole run: 0 console errors apart from the expected failed reconnects while the bridge was down', appErrors(log).length === 0, appErrors(log).slice(0, 3).join(' | '));
} finally {
  await browser.close();
  bridge.kill();
}
done();
