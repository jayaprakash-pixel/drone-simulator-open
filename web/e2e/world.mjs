// P1.10.1 the world test set: every place in data/world-places.json was resolved and checked against a second source,
// the Places list shows them grouped by type, and a flight to each one ends looking at it. Runs without the ion token
// (?notoken=1: the flat offline globe is enough to check where the camera looks), so it costs no Cesium ion traffic.
import { readFileSync } from 'node:fs';
import { cameraRest, checker, open, settledAt } from './lib.mjs';

const { check, done } = checker();
const { places } = JSON.parse(readFileSync(new URL('../../data/world-places.json', import.meta.url), 'utf8'));
const R = Math.PI / 180;
const metres = (a, b) => 2 * 6_371_008.8 * Math.asin(Math.sqrt(Math.sin(((b[0] - a[0]) * R) / 2) ** 2 + Math.cos(a[0] * R) * Math.cos(b[0] * R) * Math.sin(((b[1] - a[1]) * R) / 2) ** 2));

const unresolved = places.filter((p) => !Number.isFinite(p.lat) || !Number.isFinite(p.lon) || !p.check || p.check.startsWith('NOT RESOLVED'));
check(`P1.10.1 all ${places.length} places resolved with a second-source check recorded`, unresolved.length === 0 && places.length >= 36, unresolved.map((p) => p.name).join(', ') || `${places.filter((p) => /CHECK/.test(p.check)).length} flagged for a human look (over 2 km from the second source)`);

const { browser, page, log } = await open('?e2e=1&notoken=1', { viewport: { width: 1280, height: 800 } });
try {
  await settledAt(page, 40_000);
  await page.click('#places-toggle');
  const groups = await page.locator('#places-list .places-group').allInnerTexts();
  const want = [...new Set(places.map((p) => p.category))];
  check('P1.10.1 the Places list shows the world places grouped by type', want.every((g) => groups.includes(g)) && groups[0] === 'Phase 1 test places', groups.join(' | '));
  const missed = [];
  for (const p of places) {
    const btn = page.locator('#places-list').getByRole('button', { name: p.name, exact: true }).last(); // exact: Phase 1 has 'Pushkar (small town, lake)'; last: world entries follow Phase 1 (Thar is in both)
    if (!(await btn.count())) {
      missed.push(`${p.name}: no button`);
      continue;
    }
    await btn.click();
    await cameraRest(page, 20_000);
    const at = await page.evaluate(() => window.__dw.pick(640, 400));
    const off = at ? metres(at, [p.lat, p.lon]) : Infinity;
    if (!(off < 60)) missed.push(`${p.name}: screen centre ${off.toFixed(0)} m from the place`);
  }
  check(`P1.10.1 a flight to each of the ${places.length} places ends looking at it (screen centre within 60 m)`, missed.length === 0, missed.join('; ') || 'all within 60 m');
  check('whole run: 0 console errors, 0 bad responses', log.errors.length === 0 && log.bad.length === 0, [...log.errors, ...log.bad].slice(0, 5).join(' | '));
} finally {
  await browser.close();
}
done();
