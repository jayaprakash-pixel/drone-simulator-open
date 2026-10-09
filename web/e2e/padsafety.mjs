// P2B.2.2 input priority and P2B.2.3 controller safety, with the stubbed Gamepad API and the bridge replaying a recorded
// SITL flight (its log in sim/run-test/bridge-pad.log). Every message the page sends is recorded with its time.
import { openSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checker, open, stubGamepad } from './lib.mjs';

const { check, done } = checker();
const BRIDGE = fileURLToPath(new URL('../../bridge/', import.meta.url));
const LOG = fileURLToPath(new URL('../../sim/run-test/bridge-pad.log', import.meta.url));
const bridge = spawn(`${BRIDGE}.venv/Scripts/python.exe`, ['-u', 'ws_server.py', '--replay', 'tests/fixtures/flight.tlog'], { cwd: BRIDGE, stdio: ['ignore', openSync(LOG, 'w'), openSync(LOG, 'a')] });
const appErrors = (log) => log.errors.filter((e) => !/WebSocket connection to 'ws:\/\/127.0.0.1:800[01]\/' failed/.test(e));
const ID = 'Safety Pad (Vendor: 0001 Product: 0002)';
const cal = [0, 1, 2, 3].map(() => ({ min: -1, max: 1, centre: 0 }));
const profile = { id: ID, cal, mode: 2, invert: { throttle: false, yaw: false, pitch: false, roll: false }, buttons: { 5: 'arm' }, deadzone: 0.05, expo: 0.3 };
const frames = (page, n = 2) => page.evaluate((n) => new Promise((r) => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

const { browser, page, log } = await open('?e2e=1&notoken=1&bridge', { viewport: { width: 1100, height: 750 }, setup: stubGamepad });
try {
  await page.waitForFunction(() => document.querySelector('#bridge-status')?.textContent === 'connected', null, { timeout: 20_000 });
  await page.evaluate(([id, p]) => {
    localStorage.setItem(`dw.pad.${id}`, JSON.stringify(p));
    window.__sent = [];
    const send = WebSocket.prototype.send;
    WebSocket.prototype.send = function (d) { window.__sent.push({ t: performance.now(), m: JSON.parse(d) }); return send.call(this, d); };
    window.__dw.bridge().onState((s) => (window.__last = s));
  }, [ID, profile]);
  const lastStick = () => page.evaluate(() => window.__sent.filter((x) => 'roll' in x.m).at(-1)?.m);

  // ---- P2B.2.2 priority
  await page.keyboard.down('d'); // keyboard: yaw right
  await page.evaluate((id) => { window.__pad.connect(id); window.__pad.set([0, 0, 0.8, 0]); }, ID); // controller: roll right
  await frames(page, 4);
  await page.waitForTimeout(300);
  const both = await lastStick();
  const ind1 = await page.evaluate(() => document.getElementById('input-indicator').innerText);
  check('P2B.2.2 with keyboard and controller both active the ControlInput is the controller\'s and the indicator reads Controller', both.roll > 0.5 && both.yaw === 0 && ind1 === 'Input: Controller', `${JSON.stringify(both)}; ${ind1}`);
  await page.evaluate(() => window.__pad.disconnect());
  await page.waitForTimeout(400);
  const kb = await lastStick();
  const ind2 = await page.evaluate(() => document.getElementById('input-indicator').innerText);
  check('P2B.2.2 after the controller disconnects the indicator reads Keyboard and the keyboard\'s stick is sent', ind2 === 'Input: Keyboard' && kb.yaw > 0 && kb.roll === 0, `${JSON.stringify(kb)}; ${ind2}`);
  await page.keyboard.up('d');

  // ---- P2B.2.3 disconnect mid-flight: wait for the replayed flight to be airborne
  await page.waitForFunction(() => window.__last?.armed && window.__last.altAgl > 2, null, { timeout: 150_000, polling: 200 });
  await page.evaluate((id) => { window.__pad.connect(id); window.__pad.set([0, 0, 0.8, -0.6]); }, ID);
  await frames(page, 4);
  await page.waitForTimeout(200);
  const before = await lastStick();
  const t0 = await page.evaluate(() => { const t = performance.now(); window.__pad.disconnect(); return t; }); // the event runs synchronously
  await page.waitForTimeout(1200);
  const after = await page.evaluate((t0) => window.__sent.filter((x) => x.t >= t0), t0);
  const firstStick = after.find((x) => 'roll' in x.m);
  const cmd = after.find((x) => x.m.type === 'command' && x.m.command === 'mode' && ['loiter', 'rtl'].includes(x.m.mode));
  check('P2B.2.3 controller lost mid-flight: the next ControlInput is centred', before.roll > 0.5 && firstStick && firstStick.m.roll === 0 && firstStick.m.pitch === 0 && firstStick.m.yaw === 0, `before ${JSON.stringify(before)}; first after ${JSON.stringify(firstStick?.m)} at +${(firstStick?.t - t0).toFixed(0)} ms`);
  await page.waitForTimeout(3500); // the replay never answers commands: the bridge logs it after its 3 s wait
  const bridgeSaw = /command mode loiter/.test(readFileSync(LOG, 'utf8'));
  check('P2B.2.3 ... and a Loiter command is sent within 1 s (the bridge log has it)', Boolean(cmd) && cmd.t - t0 <= 1000 && bridgeSaw, `sent +${cmd ? (cmd.t - t0).toFixed(0) : '-'} ms; bridge log ${bridgeSaw}`);

  // ---- P2B.2.3 the arm button needs a 1 s hold
  await page.evaluate((id) => { window.__pad.connect(id); window.__pad.set([0, 0, 0, 0]); }, ID);
  await frames(page, 4);
  const hold = async (ms) => {
    const t = await page.evaluate(() => { const b = Array(17).fill(0); b[5] = 1; window.__pad.set(undefined, b); return performance.now(); });
    await page.waitForTimeout(ms);
    await page.evaluate(() => window.__pad.set(undefined, Array(17).fill(0)));
    await frames(page, 3);
    return page.evaluate((t) => window.__sent.filter((x) => x.t >= t && x.m.type === 'command' && ['arm', 'disarm'].includes(x.m.command)).length, t);
  };
  const short = await hold(500);
  const long = await hold(1100);
  check('P2B.2.3 the arm button held 0.5 s sends nothing; held 1.0 s sends arm', short === 0 && long === 1, `0.5 s: ${short} commands; 1.1 s: ${long}`);
  check('whole run: 0 console errors apart from expected bridge reconnects', appErrors(log).length === 0, appErrors(log).slice(0, 3).join(' | '));
} finally {
  await browser.close();
  bridge.kill();
}
done();
