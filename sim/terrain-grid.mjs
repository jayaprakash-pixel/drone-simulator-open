// P2A.1.6 helper: real ground heights for SITL's terrain requests. Samples the app's own Cesium World Terrain (most detailed
// level) on a regular grid around a point and writes metres above mean sea level (EGM96, the same library the app uses).
//   node sim/terrain-grid.mjs <lat> <lon> [halfKm=3] [spacingM=50] [out=sim/run/terrain-grid.json]
// Needs the built app on 127.0.0.1:3003 with the ion token. Output: { lat0, lon0, dLat, dLon, rows, cols, msl[row][col] }
// with row 0 at the south edge and column 0 at the west edge.
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { open } from '../web/e2e/lib.mjs';

const require = createRequire(new URL('../web/package.json', import.meta.url));
const { meanSeaLevel } = require('egm96-universal');

const [lat, lon] = [Number(process.argv[2]), Number(process.argv[3])];
const halfKm = Number(process.argv[4] ?? 3), spacing = Number(process.argv[5] ?? 50);
const out = process.argv[6] ?? new URL('run/terrain-grid.json', import.meta.url);
if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('usage: node sim/terrain-grid.mjs <lat> <lon> [halfKm] [spacingM] [out]');

const dLat = spacing / 111_195, dLon = spacing / (111_195 * Math.cos((lat * Math.PI) / 180));
const n = Math.round((halfKm * 1000) / spacing);
const lat0 = lat - n * dLat, lon0 = lon - n * dLon, rows = 2 * n + 1, cols = 2 * n + 1;

const { browser, page, log } = await open('?e2e=1', { viewport: { width: 400, height: 300 } });
try {
  await page.waitForFunction(() => window.__dw?.settled(), null, { timeout: 60_000 });
  const t0 = Date.now();
  const ell = await page.evaluate(async ([lat0, lon0, dLat, dLon, rows, cols]) => {
    const g = window.__dw.globe, res = [];
    for (let r = 0; r < rows; r++) {
      // one row at a time keeps memory small; the tiles stay cached between rows
      res.push(await Promise.all(Array.from({ length: cols }, (_, c) => g.groundEllipsoid(lat0 + r * dLat, lon0 + c * dLon))));
    }
    return res;
  }, [lat0, lon0, dLat, dLon, rows, cols]);
  const missing = ell.flat().filter((h) => !Number.isFinite(h)).length;
  if (missing) throw new Error(`${missing} of ${rows * cols} heights missing (no terrain?)`);
  const msl = ell.map((row, r) => row.map((h, c) => Math.round((h - meanSeaLevel(lat0 + r * dLat, lon0 + c * dLon)) * 10) / 10));
  writeFileSync(out, JSON.stringify({ source: 'Cesium World Terrain via the app, EGM96 MSL', centre: [lat, lon], spacing, lat0, lon0, dLat, dLon, rows, cols, msl }));
  const all = msl.flat();
  console.log(`${rows}x${cols} heights in ${((Date.now() - t0) / 1000).toFixed(0)} s; MSL ${Math.min(...all)} to ${Math.max(...all)} m; console errors ${log.errors.length}`);
} finally {
  await browser.close();
}
