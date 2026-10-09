// P2A.3.2 Place drone here, headless with the real bridge and SITL (needs sim/sitl-win; the bridge starts the simulator):
// click a Rajasthan town (Pushkar), press Place drone here: 'Starting simulator' progress appears, then Ready; the first
// DroneState after Ready is within 5 m of the clicked point and faces the requested heading; placing again restarts
// cleanly, leaving exactly 1 simulator process.
import { execSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cameraRest, checker, clickAt, elfPids, open, settledAt } from './lib.mjs';

const { check, done } = checker();
const BRIDGE = fileURLToPath(new URL('../../bridge/', import.meta.url));
const PY = `${BRIDGE}.venv\\Scripts\\python.exe`;
const R = Math.PI / 180;
const metres = (a, b) => 2 * 6_371_008.8 * Math.asin(Math.sqrt(Math.sin(((b[0] - a[0]) * R) / 2) ** 2 + Math.cos(a[0] * R) * Math.cos(b[0] * R) * Math.sin(((b[1] - a[1]) * R) / 2) ** 2));
const angle = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const before = elfPids(); // the PM2 bridge's simulator, if any: not this check's
const simCount = () => [...elfPids()].filter((p) => !before.has(p)).length;
const appErrors = (log) => log.errors.filter((e) => !/WebSocket connection to 'ws:\/\/127.0.0.1:800[01]\/' failed|overpass-api\.de|graph\.mapillary\.com/.test(e));

const bridge = spawn(PY, ['ws_server.py'], { cwd: BRIDGE, stdio: 'ignore' });
const { browser, page, log } = await open('?e2e=1', { viewport: { width: 1280, height: 800 } });
try {
  await settledAt(page, 40_000);
  await page.evaluate(() => void window.__dw.globe.flyToPlace(26.4897, 74.5511, 1000)); // Pushkar, Rajasthan
  await cameraRest(page, 25_000);
  await page.waitForFunction(() => window.__dw.settled(), null, { timeout: 60_000 }).catch(() => {});
  await clickAt(page);
  await page.waitForFunction(() => /Ground elevation: [\d,.]+/.test(document.querySelector('#sel-elev')?.textContent ?? ''), null, { timeout: 30_000 });
  const clicked = await page.evaluate(() => window.__dw.marker('selected'));
  // turn the camera to face east, so the requested heading (where the camera looks) is not the simulator's default 0
  await page.evaluate(() => {
    const c = window.__dw.viewer.camera;
    c.setView({ destination: c.positionWC.clone(), orientation: { heading: Math.PI / 2, pitch: c.pitch, roll: 0 } });
  });
  const heading = await page.evaluate(() => Math.round(((window.__dw.viewer.camera.heading * 180) / Math.PI + 360) % 360) % 360);

  const placeOnce = async (label) => {
    await page.evaluate(() => {
      window.__texts = [];
      window.__afterReady = [];
      const out = document.querySelector('#drone-progress');
      new MutationObserver(() => window.__texts.at(-1) !== out.textContent && window.__texts.push(out.textContent)).observe(out, { childList: true, characterData: true, subtree: true });
    });
    await page.click('#place-drone');
    await page.waitForFunction(() => window.__dw.bridge() !== null, null, { timeout: 5000 });
    await page.evaluate(() => {
      if (window.__hooked) return;
      window.__hooked = true;
      window.__dw.bridge().onState((s) => document.querySelector('#drone-progress').textContent === 'Ready' && window.__afterReady.push(s));
    });
    const ready = await page.waitForFunction(() => /^(Ready|Could not)/.test(document.querySelector('#drone-progress').textContent), null, { timeout: 120_000 }).then(() => true, () => false);
    await page.waitForFunction(() => window.__afterReady.length > 0, null, { timeout: 10_000 }).catch(() => {});
    const { texts, first } = await page.evaluate(() => ({ texts: window.__texts, first: window.__afterReady[0] }));
    console.log(`info  ${label}: ${texts.join(' > ')}`);
    return { ready, texts, first };
  };

  const a = await placeOnce('first place');
  const iStart = a.texts.findIndex((t) => t === 'Starting simulator');
  check("P2A.3.2 'Starting simulator' progress appears, then Ready", a.ready && iStart >= 0 && a.texts.at(-1) === 'Ready' && a.texts.indexOf('Ready') > iStart, a.texts.join(' > '));
  const off = a.first ? metres([a.first.lat, a.first.lon], clicked) : Infinity;
  check('P2A.3.2 the first DroneState after Ready is within 5 m of the clicked point', off <= 5, `${off.toFixed(2)} m (clicked ${clicked.map((v) => v.toFixed(6)).join(', ')})`);
  const dh = a.first ? angle(a.first.headingDeg, heading) : Infinity;
  check('P2A.3.2 ... and faces the requested heading (within 5 degrees)', dh <= 5, `requested ${heading}, got ${a.first?.headingDeg?.toFixed(1)}`);

  const b = await placeOnce('second place');
  const n = simCount();
  check('P2A.3.2 placing again restarts cleanly: Ready again and exactly 1 simulator process afterwards', b.ready && b.texts.includes('Stopping the simulator') && b.texts.at(-1) === 'Ready' && n === 1, `${b.texts.join(' > ')}; ArduCopter.elf processes: ${n}`);
  check('whole run: 0 console errors (apart from handled lookups and the bridge connect)', appErrors(log).length === 0, appErrors(log).slice(0, 3).join(' | '));
} finally {
  await browser.close();
  bridge.kill();
  execSync(`"${PY}" -c "import sitl; sitl.stop_stale()"`, { cwd: BRIDGE }); // a killed bridge cannot stop its simulator
  console.log(`info  simulators of this check left after cleanup: ${simCount()}; others untouched: ${[...before].filter((p) => elfPids().has(p)).length} of ${before.size}`);
}
done();
