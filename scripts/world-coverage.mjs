// P1.10.2: what the app has at every world test place, measured and cached (data/world-coverage.json; a rerun only
// fills gaps, FORCE=1 measures again). Per place:
//   imagery  finest Bing (Cesium ion) level that really exists, from tile probes (the app's own finestImagery)
//   osm      buildings with a building tag in a +-500 m box, and how many carry height or building:levels (Overpass)
//   mly      Mapillary true 360 panoramas and images of any kind within 500 m (500 m boxes: larger ones are refused)
//   terrain  finest Cesium World Terrain level served there and its approximate height-point spacing
// Rate limits: Overpass one query at a time with pauses and retries, Mapillary one request a second, Nominatim not used
// here (places are resolved by scripts/world-places.mjs). Needs the built app on 127.0.0.1:3003 and the tokens in
// web/.env.local. Writes the table to docs/world-coverage.md.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { open } from '../web/e2e/lib.mjs';
import { mapillaryCounts } from './mapillary-count.mjs';

const ROOT = new URL('..', import.meta.url);
const places = JSON.parse(readFileSync(new URL('data/world-places.json', ROOT), 'utf8')).places.filter((p) => Number.isFinite(p.lat));
const CACHE = new URL('data/world-coverage.json', ROOT);
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : { places: {} };
const FORCE = process.env.FORCE === '1';
const key = (p) => `${p.name}|${p.lat}|${p.lon}`;
const save = () => writeFileSync(CACHE, JSON.stringify(cache, null, 1) + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const R = Math.PI / 180;
const today = new Date().toISOString().slice(0, 10);

async function overpass(lat, lon) {
  const dLat = 500 / 110_574, dLon = 500 / (111_320 * Math.cos(lat * R));
  const box = [lat - dLat, lon - dLon, lat + dLat, lon + dLon].map((v) => v.toFixed(6)).join(',');
  const q = `[out:json][timeout:60];(way["building"](${box});relation["building"](${box}););out count;(way["building"]["height"](${box});relation["building"]["height"](${box});way["building"]["building:levels"](${box});relation["building"]["building:levels"](${box}););out count;`;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: new URLSearchParams({ data: q }), headers: { 'User-Agent': 'drone-world-simulator/0.1 (personal research; world coverage table)', Accept: 'application/json' } }).catch((e) => ({ ok: false, status: 0, e }));
    if (r.ok) {
      const counts = (await r.json()).elements.filter((e) => e.type === 'count').map((e) => Number(e.tags.total));
      return { buildings: counts[0], tagged: counts[1], at: today };
    }
    console.log(`  overpass HTTP ${r.status}, retry ${attempt} in ${15 * attempt} s`);
    await sleep(15_000 * attempt);
  }
  return { error: 'Overpass did not answer after 5 tries', at: today };
}

async function mapillary(lat, lon) {
  return { ...(await mapillaryCounts(lat, lon)), at: today }; // scripts/mapillary-count.mjs: the same box search as the app
}

// network part: Overpass and Mapillary, one place at a time
for (const p of places) {
  const c = (cache.places[key(p)] ??= {});
  if (FORCE || !c.osm || c.osm.error) {
    c.osm = await overpass(p.lat, p.lon);
    save();
    await sleep(3000);
  }
  if (FORCE || !c.mly || c.mly.error) {
    c.mly = await mapillary(p.lat, p.lon);
    save();
  }
  console.log(`${p.name}: osm ${JSON.stringify(c.osm)} mly ${JSON.stringify(c.mly)}`);
}

// browser part: imagery level and terrain level through the app itself, one page load for all places
const todo = process.env.NETONLY === '1' ? [] : places.filter((p) => FORCE || !cache.places[key(p)].imagery || !cache.places[key(p)].terrain);
if (todo.length) {
  const { browser, page, log } = await open('?e2e=1', { viewport: { width: 800, height: 500 } });
  try {
    await page.waitForFunction(() => window.__dw?.settled(), null, { timeout: 60_000 });
    for (const p of todo) {
      const r = await page.evaluate(async ([lat, lon]) => {
        const g = window.__dw.globe;
        await g.groundEllipsoid(lat, lon); // most detailed terrain sample: loads the terrain availability there
        let imagery;
        try {
          imagery = (await g.finestImagery(lat, lon)) ?? { level: '<17' };
        } catch (e) {
          imagery = { error: String(e) };
        }
        return { imagery, terrain: g.terrainDetail(lat, lon) ?? { error: 'no terrain' } };
      }, [p.lat, p.lon]);
      Object.assign(cache.places[key(p)], { imagery: { ...r.imagery, at: today }, terrain: { ...r.terrain, at: today } });
      save();
      console.log(`${p.name}: imagery ${JSON.stringify(r.imagery)} terrain ${JSON.stringify(r.terrain)}`);
    }
    if (log.errors.length) console.log('console errors:', log.errors.slice(0, 3).join(' | '));
  } finally {
    await browser.close();
  }
}

// the table
const cell = (x, f) => (!x ? '--' : x.error ? `error: ${x.error}` : f(x));
const rows = places.map((p) => {
  const c = cache.places[key(p)];
  return `| ${p.name} | ${p.category} | ${cell(c.imagery, (x) => (x.level === '<17' ? 'coarser than 17' : `${x.level} (${x.cmPerPixel} cm)`))} | ${cell(c.osm, (x) => `${x.buildings} / ${x.tagged}`)} | ${cell(c.mly, (x) => `${x.pano} / ${x.any}${x.capped ? '+' : ''}`)} | ${cell(c.terrain, (x) => `${x.level} (about ${x.spacingM} m)`)} | ${(p.check ?? '').replace(/\|/g, '/')} |`;
});
const DOC = new URL('docs/world-coverage.md', ROOT);
const head = existsSync(DOC) ? readFileSync(DOC, 'utf8') : '# World coverage\n\n<!-- table:start -->\n<!-- table:end -->\n';
const table = `<!-- table:start -->
Measured by \`node scripts/world-coverage.mjs\` (cached in \`data/world-coverage.json\`; dates per value in the cache). Last table written ${today}. Places: \`data/world-places.json\`.

| Place | Type | Finest Bing imagery level (cm per pixel) | OSM buildings in +-500 m / with height or levels tag | Mapillary within 500 m: true 360 / any | Terrain level (height-point spacing) | Centre check (second source) |
|---|---|---|---|---|---|---|
${rows.join('\n')}
<!-- table:end -->`;
writeFileSync(DOC, head.replace(/<!-- table:start -->[\s\S]*?<!-- table:end -->/, () => table));
console.log(`wrote ${rows.length} rows to docs/world-coverage.md`);
