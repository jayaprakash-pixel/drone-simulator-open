// P2B controllers with a stubbed Gamepad API (lib.mjs stubGamepad).
//  P2B.1.1 the prompt shows with no controller; after connect and a button press the name and live axes and buttons
//          show and update every frame.
//  P2B.1.3 calibration, then the mapping screen: invert, Mode 1 and 2, button actions, deadzone 5 %, the Loiter note,
//          saved per controller and loaded again on reconnect with no calibration prompt.
import { checker, open, stubGamepad } from './lib.mjs';

const { check, done } = checker();
const appErrors = (log) => log.errors.filter((e) => !/WebSocket connection to 'ws:\/\/127.0.0.1:800[01]\/' failed/.test(e));
const { browser, page, log } = await open('?e2e=1&notoken=1&bridge', { viewport: { width: 1100, height: 750 }, setup: stubGamepad });
try {
  await page.waitForSelector('#gamepad-panel', { timeout: 20_000 });
  const prompt = await page.evaluate(() => document.getElementById('gp-prompt').checkVisibility() && document.getElementById('gp-prompt').innerText);
  check('P2B.1.1 with no controller the panel asks to press a button', /Press any button/.test(prompt || ''), prompt || 'not visible');

  await page.evaluate(() => { window.__pad.connect(); window.__pad.set(undefined, [1, ...Array(16).fill(0)]); });
  await page.waitForFunction(() => document.getElementById('gp-live').checkVisibility(), null, { timeout: 3000 });
  const shown = await page.evaluate(() => ({ name: document.getElementById('gp-name').innerText, buttons: document.getElementById('gp-buttons').innerText, prompt: document.getElementById('gp-prompt').checkVisibility() }));
  check('P2B.1.1 after connect and a button press: the controller name and the pressed button show, the prompt goes', /Stub Pad/.test(shown.name) && /Buttons 0/.test(shown.buttons) && !shown.prompt, JSON.stringify(shown));

  // every frame: write a new axis value each animation frame and check the panel shows the previous frame's value
  const frames = await page.evaluate(() => new Promise((resolve) => {
    let i = 0, ok = 0;
    const step = () => {
      const shownNow = JSON.parse(document.getElementById('gp-axes').dataset.values ?? '[]')[0];
      if (i > 1 && Math.abs(shownNow - (i - 1) / 100) < 1e-9) ok++;
      window.__pad.set([i / 100, 0, 0, 0]);
      if (++i <= 61) requestAnimationFrame(step); else resolve(ok);
    };
    requestAnimationFrame(step);
  }));
  check('P2B.1.1 the axis values update every frame (60 frames in a row)', frames >= 59, `${frames} of 60 frames showed the value written one frame earlier`);
  await page.evaluate(() => window.__pad.disconnect());
  await page.waitForFunction(() => document.getElementById('gp-prompt').checkVisibility(), null, { timeout: 3000 });
  check('P2B.1.1 after a disconnect the prompt is back', true);
  // ---- P2B.1.3
  const ID = 'Mapping Pad (Vendor: 1234 Product: 5678)';
  await page.evaluate((id) => { window.__pad.connect(id); window.__pad.set(undefined, Array(17).fill(0)); }, ID);
  await page.waitForFunction(() => document.getElementById('gp-cal').checkVisibility(), null, { timeout: 3000 });
  await page.click('#gp-cal-btn'); // start
  await page.evaluate(() => new Promise((res) => {
    let i = 0;
    const step = () => {
      const t = Math.sin((i / 60) * 2 * Math.PI);
      window.__pad.set(i < 120 ? [t, -t, t, -t] : [0, 0, 0, 0]); // two sweeps, then let go
      if (++i < 140) requestAnimationFrame(step); else res();
    };
    requestAnimationFrame(step);
  }));
  await page.click('#gp-cal-btn'); // done
  const map = await page.evaluate(() => ({ visible: document.getElementById('gp-map').checkVisibility(), dz: document.getElementById('gp-deadzone').value, note: document.getElementById('gp-loiter-note').innerText, cal: document.getElementById('gp-cal').checkVisibility() }));
  check('P2B.1.3 after calibration the mapping screen shows, deadzone starts at 5 %, and it explains why Loiter is suggested', map.visible && !map.cal && map.dz === '5' && /Loiter is suggested/.test(map.note), JSON.stringify(map).slice(0, 220));

  const sticksAt = (axes) => page.evaluate(async (axes) => { window.__pad.set(axes); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return window.__dw.pad().sticks(); }, axes);
  const up3 = await sticksAt([0, 0, 0, -1]); // right stick pushed up: Mode 2 pitch forward
  await page.check('#gp-inv-pitch');
  const up3inv = await sticksAt([0, 0, 0, -1]);
  await page.uncheck('#gp-inv-pitch');
  check('P2B.1.3 invert flips that output: right stick up is forward +1, inverted -1', up3.pitch === 1 && up3inv.pitch === -1, `${up3.pitch} then ${up3inv.pitch}`);

  const m2 = await sticksAt([0, -1, 0, 0]); // left stick up
  await page.selectOption('#gp-mode', '1');
  const m1 = await sticksAt([0, -1, 0, 0]);
  const m1r = await sticksAt([0, 0, 0, -1]);
  await page.selectOption('#gp-mode', '2');
  check('P2B.1.3 Mode 2: left stick up is throttle; Mode 1: left stick up is pitch and right stick up is throttle', m2.throttle === 1 && m2.pitch === 0 && m1.pitch === 1 && m1.throttle === 0 && m1r.throttle === 1, `Mode 2 left up ${JSON.stringify(m2)}; Mode 1 left up ${JSON.stringify(m1)}, right up ${JSON.stringify(m1r)}`);

  const assign = { arm: '5', takeoff: '0', land: '1', rtl: '2', loiter: '4', camera: '3' };
  for (const [a, b] of Object.entries(assign)) await page.selectOption(`#gp-btn-${a}`, b);
  await page.evaluate(() => (window.__dw.actionLog.length = 0));
  for (const b of [0, 1, 2, 4, 3, 5]) {
    await page.evaluate(async (b) => {
      const btn = Array(17).fill(0); btn[b] = 1;
      window.__pad.set(undefined, btn); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (b === 5) await new Promise((r) => setTimeout(r, 1100)); // arm needs a 1 s hold (P2B.2.3)
      window.__pad.set(undefined, Array(17).fill(0)); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }, b);
  }
  const fired = await page.evaluate(() => [...window.__dw.actionLog]);
  check('P2B.1.3 each assigned button fires its action once: take off, land, return home, Loiter, camera, arm', JSON.stringify(fired) === JSON.stringify(['takeoff', 'land', 'rtl', 'loiter', 'camera', 'arm']), JSON.stringify(fired));

  await page.click('#gp-save');
  await page.evaluate(() => window.__pad.disconnect());
  await page.waitForFunction(() => document.getElementById('gp-prompt').checkVisibility(), null, { timeout: 3000 });
  await page.evaluate((id) => window.__pad.connect(id), ID);
  await page.waitForFunction(() => document.getElementById('gp-map').checkVisibility(), null, { timeout: 3000 });
  const again = await page.evaluate((id) => ({ cal: document.getElementById('gp-cal').checkVisibility(), status: document.getElementById('gp-status').innerText, takeoff: document.getElementById('gp-btn-takeoff').value, saved: Boolean(localStorage.getItem(`dw.pad.${id}`)) }), ID);
  check('P2B.1.3 saved per controller: on reconnect the profile loads with no calibration prompt and the same mapping', again.saved && !again.cal && /Profile loaded/.test(again.status) && again.takeoff === '0', JSON.stringify(again));
  check('whole run: 0 console errors apart from expected bridge reconnects', appErrors(log).length === 0, appErrors(log).slice(0, 3).join(' | '));
} finally {
  await browser.close();
}
done();
