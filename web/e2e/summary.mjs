// P3.1.3 the flight summary panel after landing (the values are unit-tested in src/drone/summary.test.ts): the bridge
// replays the recorded SITL spike flight (arm, take off to about 9.5 m, land, disarm); after the disarm the panel shows
// duration, distance, max height, max speed, clearance, battery used, fence breaches and crash status.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checker, open } from './lib.mjs';

const { check, done } = checker();
const BRIDGE = fileURLToPath(new URL('../../bridge/', import.meta.url));
const bridge = spawn(`${BRIDGE}.venv/Scripts/python.exe`, ['ws_server.py', '--replay', 'tests/fixtures/flight.tlog'], { cwd: BRIDGE, stdio: 'ignore' });
const appErrors = (log) => log.errors.filter((e) => !/WebSocket connection to 'ws:\/\/127.0.0.1:800[01]\/' failed/.test(e));
const { browser, page, log } = await open('?e2e=1&notoken=1&bridge', { viewport: { width: 1100, height: 750 } });
try {
  const shown = await page.waitForFunction(() => document.getElementById('flight-summary')?.checkVisibility(), null, { timeout: 200_000, polling: 250 }).then(() => true, () => false);
  const r = await page.evaluate(() => ({ text: document.getElementById('flight-summary')?.innerText ?? '', sum: JSON.parse(document.getElementById('flight-summary')?.dataset.summary ?? 'null') }));
  console.log(`info  ${JSON.stringify(r.sum)}`);
  const labels = ['Duration', 'Distance', 'Max height', 'Max speed', 'Lowest clearance', 'Battery used', 'Fence breaches', 'crash'];
  check('P3.1.3 after landing the panel shows duration, distance, max height, max speed, clearance, battery used, fence breaches and crash status',
    shown && labels.every((l) => r.text.includes(l)) && r.sum && r.sum.maxHeightM > 9 && r.sum.maxHeightM < 10.5 && r.sum.durationS > 20 && r.sum.crashed === false && r.sum.batteryUsedPct >= 0,
    r.text.replace(/\n/g, ' | '));
  check('whole run: 0 console errors apart from expected bridge reconnects', appErrors(log).length === 0, appErrors(log).slice(0, 3).join(' | '));
} finally {
  await browser.close();
  bridge.kill();
}
done();
