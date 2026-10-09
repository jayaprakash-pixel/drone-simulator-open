// P1.6.2 data accuracy: ground elevation (MSL) read through the app's own pipeline (most-detailed Cesium World Terrain
// height, ellipsoid -> EGM96 mean sea level) against published elevations. Rerun after any change of data source.
// Reference points: Wikidata (retrieved 2026-10-08), each claim carries a reference; the airports are surveyed elevations.
import { checker, open, settledAt, writeSection } from './lib.mjs';
import { POINTS } from './points.mjs';

const TOLERANCE_M = 30; // plan p.9: "within about 30 meters of published values"

const { check, done } = checker();
const { browser, page, log } = await open('?e2e=1', { viewport: { width: 800, height: 500 } });
try {
  await settledAt(page, 40_000);
  const rows = [];
  for (const p of POINTS) {
    const r = await page.evaluate(async ({ lat, lon }) => ({ msl: await window.__dw.globe.groundMsl(lat, lon), ell: await window.__dw.globe.groundEllipsoid(lat, lon) }), p);
    rows.push({ ...p, ...r, err: r.msl - p.published, errNoGeoid: r.ell - p.published });
  }
  for (const r of rows) check(`P1.6.2 ${r.name}: ${r.msl?.toFixed(1)} m MSL vs published ${r.published} m`, r.msl !== undefined && Math.abs(r.err) <= TOLERANCE_M, `error ${r.err >= 0 ? '+' : ''}${r.err.toFixed(1)} m (limit ${TOLERANCE_M} m)`);
  check('whole run: 0 console errors', log.errors.length === 0, log.errors.join(' | '));

  const f = (n) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}`;
  writeSection(
    'accuracy',
    `## Elevation accuracy (P1.6.2, e2e/accuracy.mjs)

Ground elevation read through the app's own pipeline (Cesium World Terrain, most detailed level, converted to metres above mean sea level with EGM96) against published elevations. Limit: ${TOLERANCE_M} m. Last run ${new Date().toISOString().slice(0, 10)}.

| Place | Lat, Lon | Published (m) | App (m MSL) | Error (m) | Without the geoid correction: error (m) |
|---|---|---|---|---|---|
${rows.map((r) => `| ${r.name} | ${r.lat}, ${r.lon} | ${r.published} | ${r.msl?.toFixed(1)} | ${f(r.err)} | ${f(r.errNoGeoid)} |`).join('\n')}

Sources: ${rows.map((r) => `${r.name}: ${r.source}`).join('; ')}. The last column is the height Cesium reports above the ellipsoid compared with the same published value: it shows why altitude types are never mixed (plan p.5): skipping the EGM96 correction would put most Rajasthan elevations 30 to 75 m off, beyond the ${TOLERANCE_M} m target.

What the numbers mean (cross-check done once on 2026-10-08 with OpenTopoData, an open elevation service):
- Cesium World Terrain in Rajasthan is effectively the 30 m SRTM dataset: at the Jaipur point SRTM reads 441 m (app 441.0), at Jaipur airport 382 m (app 382.5), and next to the summit SRTM 1,681 m and ASTER 1,682 m (app 1,679 m there). ASTER, an independent 30 m dataset, agrees within about 5 m.
- At the summit node itself SRTM reads 1,697 m and ASTER 1,703 m, so the roughly 25 m shortfall against the surveyed 1,722 m is inherent to a 30 m grid, which averages a sharp top. OpenStreetMap lists the same peak at 1,690 m, so the published values themselves differ by 32 m.
- SRTM's own absolute vertical accuracy is quoted as about 16 m, which fits the 15 to 17 m errors at the Jaisalmer points.
- Wikidata's coordinate for Guru Shikhar is about 1.8 km from the summit and reads 1,376 m; always take hill positions from OpenStreetMap or a map, not from a city-centre style coordinate.`,
  );
  console.log(rows.map((r) => `info  ${r.name}: app ${r.msl?.toFixed(1)} vs ${r.published} (${f(r.err)}); ellipsoid height would be ${f(r.errNoGeoid)} off`).join('\n'));
} finally {
  await browser.close();
}
done();
