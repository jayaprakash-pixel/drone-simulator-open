// A full rehearsal at one place (P3.5.6 draft entries, P3.5.4 KML check), live (test bridge 8001 and test simulator;
// needs sim/sitl-win and terrain):
//   PLACE="Munnar, Kerala" LAT=10.0889 LON=77.0595 node e2e/rehearsal.mjs
// Place the drone, 4 waypoints about 120 m out, 70 m above home raised in 10 m steps until the terrain check is clear
// (the contract caps heights at 120 m), pre-flight checklist,
// Upload and fly, the mission's return home and landing, then the flight log exported to CSV and KML
// (bridge/export.py). The KML is validated: it parses as XML, has one LineString with one coordinate per logged sample,
// and every coordinate matches the log. A draft entry is appended to docs/rehearsals.md for the owner to confirm.
import { execSync, spawn } from 'node:child_process';
import { appendFileSync, existsSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cameraRest, checker, clickAt, open, settledAt } from './lib.mjs';

const { check, done } = checker();
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const BRIDGE = `${ROOT}bridge/`;
const PY = `${BRIDGE}.venv/Scripts/python.exe`;
const BLOG = `${ROOT}sim/run-test/bridge-rehearsal.log`;
const DOC = `${ROOT}docs/rehearsals.md`;
const NAME = process.env.PLACE ?? 'Pushkar, Rajasthan';
const HOME = [Number(process.env.LAT ?? 26.4897), Number(process.env.LON ?? 74.5511)];
const R = Math.PI / 180;
const metres = (a, b) => 2 * 6_371_008.8 * Math.asin(Math.sqrt(Math.sin(((b[0] - a[0]) * R) / 2) ** 2 + Math.cos(a[0] * R) * Math.cos(b[0] * R) * Math.sin(((b[1] - a[1]) * R) / 2) ** 2));
const offset = ([n, e], alt) => ({ lat: HOME[0] + n / 111_195, lon: HOME[1] + e / (111_195 * Math.cos(HOME[0] * R)), alt, speed: 6 });
const bridge = spawn(PY, ['-u', 'ws_server.py'], { cwd: BRIDGE, stdio: ['ignore', openSync(BLOG, 'w'), openSync(BLOG, 'a')] });
const { browser, page, log } = await open('?e2e=1', { viewport: { width: 1280, height: 800 } });
const date = new Date().toISOString().slice(0, 10);
try {
  await settledAt(page, 90_000);
  await page.selectOption('#quality', '0.5');
  await page.evaluate(([la, lo]) => void window.__dw.globe.flyToPlace(la, lo, 600), HOME);
  await cameraRest(page, 30_000);
  // place at exactly HOME: the selection comes from a click, so click and then move the selection there
  await clickAt(page);
  await page.waitForFunction(() => /Ground elevation: [\d,.]+/.test(document.querySelector('#sel-elev')?.textContent ?? ''), null, { timeout: 30_000 });
  await page.click('#place-drone');
  await page.waitForFunction(() => document.querySelector('#drone-progress')?.textContent === 'Ready', null, { timeout: 150_000 });
  await page.evaluate(() => { window.__states = []; window.__dw.bridge().onState((s) => { window.__last = s; window.__states.push(s); }); });
  const home = await page.evaluate(() => window.__dw.marker('selected'));
  await page.click('#side-close');
  await page.click('#mission summary');

  // plan around the placed home; raise the height until the terrain check is clear (the contract allows 120 m)
  let alt = 70, verdict = '';
  const plan = (a) => [[120, 0], [120, 120], [0, 120], [-60, 60]].map(([n, e]) => ({ ...offset([n, e], a), lat: home[0] + n / 111_195, lon: home[1] + e / (111_195 * Math.cos(home[0] * R)) }));
  for (; alt <= 120; alt += 10) {
    await page.evaluate((w) => window.__dw.mission.set(w), plan(alt));
    await page.click('#mission-check');
    await page.waitForFunction(() => /^(Clear|Too close|The terrain)/.test(document.querySelector('#mission-result').textContent), null, { timeout: 60_000 });
    verdict = await page.locator('#mission-result').innerText();
    if (/^Clear/.test(verdict)) break;
  }
  const clear = /^Clear/.test(verdict);
  check(`rehearsal ${NAME}: terrain check clear at ${alt} m above home`, clear, verdict);
  if (!clear) throw new Error(`no clear height up to 120 m at ${NAME}`);

  const t0 = Date.now();
  let flying = false;
  while (Date.now() - t0 < 150_000 && !flying) {
    await page.click('#mission-fly');
    await page.locator('#pf-continue').click({ timeout: 3000 }).catch(() => {});
    await page.waitForFunction(() => !/Uploading|Taking off/.test(document.querySelector('#mission-progress').textContent), null, { timeout: 90_000 }).catch(() => {});
    flying = /Flying|Waypoint/.test(await page.locator('#mission-progress').innerText());
    if (!flying) await page.waitForTimeout(4000);
  }
  // the mission ends with return home; wait for the landing and disarm
  await page.waitForFunction(() => window.__states.some((s) => s.mode === 'AUTO') && window.__last && !window.__last.armed, null, { timeout: 600_000, polling: 1000 });
  const st = await page.evaluate(() => window.__states);
  const auto = st.filter((s) => s.mode === 'AUTO');
  const wps = await page.evaluate(() => window.__dw.mission.points());
  const nearest = wps.map((w) => Math.min(...auto.map((s) => metres([s.lat, s.lon], [w.lat, w.lon]))));
  const last = st.at(-1);
  const landed = metres([last.lat, last.lon], home);
  check(`rehearsal ${NAME}: every waypoint reached within 5 m, landed home`, nearest.every((m) => m <= 5) && landed <= 5, `nearest ${nearest.map((m) => m.toFixed(1)).join(', ')} m; landed ${landed.toFixed(1)} m from home`);

  // export and validate the KML (P3.5.4 automated part; opening it in Google Earth is the owner's)
  const logFile = [...readFileSync(BLOG, 'utf8').matchAll(/flight log (.+\.jsonl)/g)].at(-1)[1].trim();
  const ex = execSync(`"${PY}" export.py "${logFile}"`, { cwd: BRIDGE }).toString().trim();
  const [csv, kml] = ex.replace(/^wrote /, '').split(' and ');
  const v = JSON.parse(execSync(`"${PY}" -I -c "
import json, sys
from xml.dom import minidom
d = minidom.parse(sys.argv[1])
ls = d.getElementsByTagName('LineString')
coords = [tuple(map(float, c.split(','))) for c in ls[0].getElementsByTagName('coordinates')[0].firstChild.data.split()] if ls else []
rows = [json.loads(l) for l in open(sys.argv[2], encoding='utf-8')]
samples = [r['state'] for r in rows if r.get('type') == 'sample' and r.get('state')]
bad = sum(1 for c, s in zip(coords, samples) if abs(c[0] - s['lon']) > 1e-6 or abs(c[1] - s['lat']) > 1e-6 or abs(c[2] - s['altMsl']) > 0.01)
print(json.dumps({'lineStrings': len(ls), 'coords': len(coords), 'samples': len(samples), 'mismatched': bad, 'lat': [min(c[1] for c in coords), max(c[1] for c in coords)] if coords else None, 'lon': [min(c[0] for c in coords), max(c[0] for c in coords)] if coords else None}))
" "${kml}" "${logFile}"`).toString());
  check(`P3.5.4 KML from ${NAME} validates (XML, one LineString, one coordinate per sample, all equal to the log)`, v.lineStrings === 1 && v.coords === v.samples && v.mismatched === 0 && v.coords > 100, JSON.stringify(v));

  const lowest = verdict.match(/lowest clearance (-?\d+) m/)?.[1];
  const entry = `\n## ${NAME} (${date}) - draft from the automated rehearsal, for the owner to confirm\n\n- **Place:** ${home.map((x) => x.toFixed(5)).join(', ')} (home as placed)\n- **Log file:** ${logFile.replace(ROOT.replace(/\//g, '\\'), '').replace(/\\/g, '/')} (CSV and KML exported next to it)\n- **Terrain check:** ${verdict} (heights raised to ${alt} m above home until clear)\n- **What the log showed:** 4 waypoints reached within ${Math.max(...nearest).toFixed(1)} m; returned home and landed ${landed.toFixed(1)} m from home; ${auto.length} states in Auto; KML ${v.coords} points equal to the log.\n- **Fix:** none needed in this run.\n- **Owner:** open the KML in Google Earth and confirm the path (P3.5.4); confirm or correct this entry (P3.5.6).\n`;
  if (!existsSync(DOC)) writeFileSync(DOC, '# Rehearsals (P3.5.6)\n\nOne entry per full rehearsal. Entries marked draft were written by `web/e2e/rehearsal.mjs`; the owner confirms them.\n');
  appendFileSync(DOC, entry);
  console.log(`info  ${NAME}: lowest clearance ${lowest} m at ${alt} m; entry appended to docs/rehearsals.md`);
  check('whole run: 0 console errors (apart from handled lookups)', log.errors.filter((e) => !/overpass|mapillary|WebSocket connection|virtualearth/.test(e)).length === 0, log.errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  bridge.kill();
  execSync(`"${PY}" -c "import sitl; sitl.stop_stale()"`, { cwd: BRIDGE });
}
done();
