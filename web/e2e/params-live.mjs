// P3.4.1 parameter profile and P3.4.2 notices, live (test bridge 8001 and test simulator; needs sim/sitl-win).
// Place at Pushkar; Parameters: Read from drone, change six values (return height, two speeds, fence radius and action,
// low battery action), Apply, Export .param. Place again (a fresh simulator, its own defaults), Load .param from the
// exported file, Apply, Read: every exported name reads back identical. Then every exported file type carries the
// rehearsal-only notice: the .param, a mission export, and the flight log's CSV and KML (bridge/export.py); the
// first-screen notice is still shown.
import { execSync, spawn } from 'node:child_process';
import { mkdirSync, openSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cameraRest, checker, clickAt, open, settledAt } from './lib.mjs';

const { check, done } = checker();
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const BRIDGE = `${ROOT}bridge/`;
const PY = `${BRIDGE}.venv/Scripts/python.exe`;
const RUN = `${ROOT}sim/run-test/`;
const OUT = `${RUN}exports/`;
const BLOG = `${RUN}bridge-params.log`;
const NOTICE = 'Rehearsal tool only: not a substitute for pre-flight checks or legal permission to fly.';
const CHANGE = { RTL_ALT_M: 25, WP_SPD: 7.5, LOIT_SPEED_MS: 8, FENCE_RADIUS: 150, FENCE_ACTION: 2, BATT_FS_LOW_ACT: 2 };
mkdirSync(OUT, { recursive: true });
const bridge = spawn(PY, ['-u', 'ws_server.py'], { cwd: BRIDGE, stdio: ['ignore', openSync(BLOG, 'w'), openSync(BLOG, 'a')] });
const { browser, page, log } = await open('?e2e=1', { viewport: { width: 1280, height: 800 } });
const status = () => page.locator('#params-status').innerText();
const waitStatus = (re) => page.waitForFunction((r) => new RegExp(r).test(document.querySelector('#params-status').textContent), re.source, { timeout: 60_000 });
async function place() {
  await page.evaluate(() => (document.querySelector('#drone-progress').textContent = ''));
  await page.click('#place-drone');
  await page.waitForFunction(() => document.querySelector('#drone-progress')?.textContent === 'Ready', null, { timeout: 120_000 });
}
const tableValues = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#params-table tr')].map((tr) => [tr.cells[0].textContent, Number(tr.querySelector('input').value)])));

try {
  await settledAt(page, 90_000);
  await page.selectOption('#quality', '0.5');
  await page.evaluate(() => void window.__dw.globe.flyToPlace(26.4897, 74.5511, 1000));
  await cameraRest(page, 25_000);
  await clickAt(page);
  await page.waitForFunction(() => /Ground elevation: [\d,.]+/.test(document.querySelector('#sel-elev')?.textContent ?? ''), null, { timeout: 30_000 });
  await place();
  await page.click('#params summary');
  await page.click('#params-read');
  await waitStatus(/^Read \d+ settings|^Read:/);
  const first = await tableValues();
  for (const [k, v] of Object.entries(CHANGE)) {
    const input = page.locator('#params-table input').and(page.locator(`[aria-label="${k}"]`));
    await input.fill(String(v));
    await input.dispatchEvent('change');
  }
  await page.click('#params-apply');
  await waitStatus(/^Applied|^Apply:/);
  const applied = await status();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#params-export')]);
  const paramFile = `${OUT}${dl.suggestedFilename()}`;
  await dl.saveAs(paramFile);
  const exported = Object.fromEntries(readFileSync(paramFile, 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split(',')).map(([k, v]) => [k, Number(v)]));
  console.log(`info  read ${Object.keys(first).length} settings (RTL_ALT_M ${first.RTL_ALT_M}, WP_SPD ${first.WP_SPD}); ${applied}; exported ${Object.keys(exported).length} to ${paramFile}`);

  // a fresh simulator: its own defaults, then the exported file
  await place();
  await page.click('#params-read');
  await waitStatus(/^Read \d+ settings|^Read:/);
  const fresh = await tableValues();
  console.log(`info  fresh read: "${await status()}" RTL_ALT_M ${fresh.RTL_ALT_M} WP_SPD ${fresh.WP_SPD}`);
  await page.setInputFiles('#params-file', paramFile);
  await waitStatus(/^Loaded/);
  const loaded = await status();
  await page.click('#params-apply');
  await waitStatus(/^Applied|^Apply:/);
  const applied2 = await status();
  await page.click('#params-read');
  await waitStatus(/^Read \d+ settings|^Read:/);
  const readBack = await status(); // the table counts only after a read the drone answered
  const back = /^Read \d+ settings/.test(readBack) ? await tableValues() : {};
  const diff = Object.keys(exported).filter((k) => Math.abs(back[k] - exported[k]) > 1e-4 * Math.max(1, Math.abs(exported[k])));
  const changedOnFresh = Object.keys(CHANGE).filter((k) => fresh[k] !== CHANGE[k]);
  console.log(`info  fresh simulator had ${changedOnFresh.map((k) => `${k} ${fresh[k]}`).join(', ')}; ${loaded}; ${applied2}`);
  check('P3.4.1 export writes a .param file for the tested configuration (return height, speeds, fence, failsafes, flight modes)', ['RTL_ALT_M', 'WP_SPD', 'FENCE_RADIUS', 'FENCE_ACTION', 'BATT_FS_LOW_ACT', 'FS_GCS_ENABLE', 'FLTMODE1'].every((k) => k in exported) && Object.entries(CHANGE).every(([k, v]) => exported[k] === v), `${Object.keys(exported).length} names, ${Object.entries(CHANGE).map(([k]) => `${k} ${exported[k]}`).join(', ')}`);
  check('P3.4.1 loading it into a fresh SITL reads back identical values for every exported name', changedOnFresh.length === Object.keys(CHANGE).length && diff.length === 0 && /^Applied/.test(applied2) && /^Read \d+ settings/.test(readBack), diff.length ? `differ: ${diff.map((k) => `${k} ${back[k]} vs ${exported[k]}`).join(', ')}` : `all ${Object.keys(exported).length} equal; the fresh simulator differed in ${changedOnFresh.length} of the ${Object.keys(CHANGE).length} changed names before loading`);
  const text = readFileSync(paramFile, 'utf8');
  check('P3.4.1 the export carries the real-drone header and only whitelisted names, and the screen says why', /real drone needs its own checks, tuning and calibration/.test(text) && !/^(SIM_|ATC_|FRAME_|INS_|COMPASS_|MOT_|BATT_CAPACITY)/m.test(text) && /never exported/.test(await page.locator('#params-why').innerText()));

  // P3.4.2: every exported file type carries the notice
  await page.evaluate(() => localStorage.setItem('dw.mission', JSON.stringify([{ lat: 26.49, lon: 74.552, alt: 20, speed: 5 }])));
  await page.reload({ waitUntil: 'load' });
  await settledAt(page, 90_000);
  await page.click('#mission summary');
  const [md] = await Promise.all([page.waitForEvent('download'), page.click('#mission-export')]);
  const missionFile = `${OUT}${md.suggestedFilename()}`;
  await md.saveAs(missionFile);
  const flightLog = [...readFileSync(BLOG, 'utf8').matchAll(/flight log (.+\.jsonl)/g)].at(-1)?.[1]?.trim();
  const ex = execSync(`"${PY}" export.py "${flightLog}"`, { cwd: BRIDGE }).toString().trim();
  const [csv, kml] = ex.replace(/^wrote /, '').split(' and ');
  const has = Object.fromEntries([['param', paramFile], ['mission', missionFile], ['csv', csv], ['kml', kml]].map(([k, f]) => [k, readFileSync(f, 'utf8').includes(NOTICE)]));
  check('P3.4.2 the notice line is present in every exported mission, parameter file, KML and CSV', Object.values(has).every(Boolean), JSON.stringify(has));
  check('P3.4.2 the first-screen notice is still shown', (await page.locator('#rehearsal-notice').innerText()) === NOTICE && (await page.locator('#rehearsal-notice').isVisible()));
  check('whole run: 0 console errors (apart from handled lookups)', log.errors.filter((e) => !/overpass|mapillary|WebSocket connection|virtualearth/.test(e)).length === 0, log.errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  bridge.kill();
  execSync(`"${PY}" -c "import sitl; sitl.stop_stale()"`, { cwd: BRIDGE });
}
done();
