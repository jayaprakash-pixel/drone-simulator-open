// P2A.5.2 key bindings in a real browser (the table itself is tested in src/input/keyboard.test.ts), against the bridge
// replaying a recorded SITL flight: holding W pushes the throttle stick and the ControlInput the page sends; typing in
// the search box does not; Esc centres every stick at once; Enter while the replayed drone is airborne asks first, and
// cancelling sends no command.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checker, open } from './lib.mjs';

const { check, done } = checker();
const BRIDGE = fileURLToPath(new URL('../../bridge/', import.meta.url));
const bridge = spawn(`${BRIDGE}.venv\\Scripts\\python.exe`, ['ws_server.py', '--replay', 'tests\\fixtures\\flight.tlog'], { cwd: BRIDGE, stdio: 'ignore' });
const appErrors = (log) => log.errors.filter((e) => !/WebSocket connection to 'ws:\/\/127.0.0.1:800[01]\/' failed/.test(e));

const { browser, page, log } = await open('?e2e=1&notoken=1&bridge', { viewport: { width: 1000, height: 700 } });
try {
  await page.waitForFunction(() => document.querySelector('#bridge-status')?.textContent === 'connected', null, { timeout: 15_000 });
  // what leaves the page: wrap the socket's send
  await page.evaluate(() => {
    window.__sent = [];
    const orig = WebSocket.prototype.send;
    WebSocket.prototype.send = function (d) {
      window.__sent.push(JSON.parse(d));
      return orig.call(this, d);
    };
  });
  const sticks = () => page.evaluate(() => ({ push: { ...window.__dw.sticks.push }, pos: { ...window.__dw.sticks.pos } }));

  await page.keyboard.down('w');
  await page.waitForTimeout(400);
  const held = await sticks();
  const sentThrottle = await page.evaluate(() => window.__sent.filter((m) => 'throttle' in m).at(-1));
  await page.keyboard.up('w');
  check('P2A.5.2 holding W pushes the throttle stick up and it ramps', held.push.throttle === 1 && held.pos.throttle > 0.3, `push ${held.push.throttle}, stick ${held.pos.throttle.toFixed(2)}, last ControlInput ${JSON.stringify(sentThrottle)}`);

  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('d');
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  const esc = await sticks();
  await page.keyboard.up('ArrowUp');
  await page.keyboard.up('d');
  check('P2A.5.2 Esc zeroes all sticks at once (while keys are still held)', Object.values(esc.pos).every((v) => v === 0) && Object.values(esc.push).every((v) => v === 0), JSON.stringify(esc));

  await page.locator('input').first().focus();
  await page.keyboard.down('w');
  await page.waitForTimeout(200);
  const typing = await sticks();
  await page.keyboard.up('w');
  await page.locator('input').first().evaluate((el) => el.blur());
  check('P2A.5.2 keys are ignored while typing in an input box', typing.push.throttle === 0 && typing.pos.throttle === 0);

  // the recording climbs to 10 m after about 45 s of boot and arming; wait for the replay to be airborne
  await page.evaluate(() => window.__dw.bridge().onState((s) => (window.__last = s)));
  const airborne = await page.waitForFunction(() => window.__last?.armed && window.__last.altAgl > 2, null, { timeout: 150_000, polling: 200 }).then(() => true, () => false);
  let dialog = null;
  page.once('dialog', async (d) => {
    dialog = d.message();
    await d.dismiss();
  });
  const before = await page.evaluate(() => window.__sent.filter((m) => m.type === 'command').length);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => window.__sent.filter((m) => m.type === 'command').length);
  check('P2A.5.2 Enter while airborne asks for confirmation, and cancelling sends no command', Boolean(airborne) && /Disarm while flying/.test(dialog ?? '') && after === before, `dialog: ${dialog}; commands sent ${after - before}`);
  check('whole run: 0 console errors apart from expected bridge reconnects', appErrors(log).length === 0, appErrors(log).slice(0, 3).join(' | '));
} finally {
  await browser.close();
  bridge.kill();
}
done();
