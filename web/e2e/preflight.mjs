// P3.3.5 pre-flight checklist in a real browser, against the bridge replaying a recorded SITL flight (states with a GPS
// fix and a full battery): with no home set, T is blocked with the reason and no take off is sent; with home set, the
// only items not passing are warnings (no geofence), so T opens the checklist, sends nothing until one click on
// Continue, then sends the take off; a second T sends it at once (warnings already accepted for this place).
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checker, open } from './lib.mjs';

const { check, done } = checker();
const BRIDGE = fileURLToPath(new URL('../../bridge/', import.meta.url));
const bridge = spawn(`${BRIDGE}.venv\\Scripts\\python.exe`, ['ws_server.py', '--replay', 'tests\\fixtures\\flight.tlog'], { cwd: BRIDGE, stdio: 'ignore' });
const appErrors = (log) => log.errors.filter((e) => !/WebSocket connection to 'ws:\/\/127.0.0.1:800[01]\/' failed/.test(e));
const { browser, page, log } = await open('?e2e=1&notoken=1&bridge', { viewport: { width: 1100, height: 750 } });
try {
  await page.waitForFunction(() => document.querySelector('#bridge-status')?.textContent === 'connected', null, { timeout: 15_000 });
  await page.waitForFunction(() => window.__dw.instruments && document.querySelector('#inst-gps')?.textContent, null, { timeout: 15_000 });
  await page.evaluate(() => {
    window.__sent = [];
    const orig = WebSocket.prototype.send;
    WebSocket.prototype.send = function (d) {
      const m = JSON.parse(d);
      if (m.type === 'command') window.__sent.push(m.command);
      return orig.call(this, d);
    };
  });
  const sent = () => page.evaluate(() => window.__sent.filter((c) => c === 'takeoff').length);
  const items = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#pf-items li')].map((li) => [li.dataset.id, li.dataset.status])));

  // 1. no home: a fail blocks take off, with its reason
  await page.keyboard.press('t');
  await page.waitForSelector('#preflight:not(.hidden)', { timeout: 5000 });
  const blocked = { items: await items(), text: await page.locator('#pf-blocked').innerText().catch(() => ''), cont: await page.locator('#pf-continue').count() };
  await page.waitForTimeout(500);
  check('P3.3.5 a fail disables take off with its reason', blocked.items.home === 'fail' && /place the drone first/.test(blocked.text) && blocked.cont === 0 && (await sent()) === 0, JSON.stringify({ ...blocked, sent: await sent() }));
  await page.click('#pf-close');

  // 2. home set: only warnings left; one click continues
  await page.waitForFunction(() => window.__dw.bridgeState?.()?.gpsFix >= 3 || /3D|RTK|DGPS/.test(document.querySelector('#inst-gps')?.textContent ?? ''), null, { timeout: 30_000 }); // the replay has a fix again
  await page.evaluate(() => window.__dw.setPlace(26.4897, 74.5511, 470));
  await page.keyboard.press('t');
  await page.waitForSelector('#preflight:not(.hidden)', { timeout: 5000 });
  const warn = await items();
  await page.waitForTimeout(500);
  const before = await sent();
  await page.click('#pf-continue');
  await page.waitForTimeout(500);
  const after = await sent();
  check('P3.3.5 a warning needs one click to continue', Object.values(warn).every((s) => s !== 'fail') && warn.fence === 'warn' && before === 0 && after === 1, `items ${JSON.stringify(warn)}; take off sent before the click ${before}, after ${after}`);
  await page.keyboard.press('t');
  await page.waitForTimeout(500);
  check('P3.3.5 once accepted, the same warnings do not ask again for this place', (await sent()) === 2 && (await page.locator('#preflight.hidden').count()) === 1, `take off sent ${await sent()} times`);
  check('whole run: 0 console errors', appErrors(log).length === 0, appErrors(log).slice(0, 3).join(' | '));
} finally {
  await browser.close();
  bridge.kill();
}
done();
